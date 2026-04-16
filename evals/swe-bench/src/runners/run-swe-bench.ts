import path from 'node:path'
import fs from 'node:fs/promises'

import { loadConfig } from '@codelord/config'
import { runHeadless, resolveModel, resolveApiKey } from '@codelord/coding-agent'
import { exitWithResult, writeResult } from '@codelord/evals-shared'

import type { SWEBenchPrediction, SolveResult } from '../types.js'
import { loadDataset } from '../dataset.js'
import { prepareRepo, buildPrompt, extractPatch, resetRepo } from '../adapter.js'
import { buildSWEBenchEvalResult, buildSWEBenchRuntimeErrorResult, registerSWEBenchRenderer } from '../eval-result.js'

// --- CLI argument parsing ---------------------------------------------------

function parseArgs(argv: string[]) {
  const args = argv.slice(2)
  let dataDir = './data'
  let limit: number | undefined
  let instanceIds: string[] | undefined
  let output: string | undefined
  let repos: string[] | undefined

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--data-dir':
        dataDir = args[++i]!
        break
      case '--limit':
        limit = Number(args[++i])
        break
      case '--instance-ids':
        instanceIds = args[++i]!.split(',').map((s) => s.trim())
        break
      case '--output':
        output = args[++i]!
        break
      case '--repos':
        repos = args[++i]!.split(',').map((s) => s.trim())
        break
    }
  }

  return { dataDir: path.resolve(dataDir), limit, instanceIds, output, repos }
}

// --- Main -------------------------------------------------------------------

async function main() {
  registerSWEBenchRenderer()

  const startTime = Date.now()
  const opts = parseArgs(process.argv)
  const dataDir = opts.dataDir
  const reposDir = path.join(dataDir, 'repos')
  const resultsDir = path.join(dataDir, 'results')
  await fs.mkdir(reposDir, { recursive: true })
  await fs.mkdir(resultsDir, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outputPath = opts.output ? path.resolve(opts.output) : path.join(resultsDir, `results-${timestamp}.json`)
  const predictionsPath = opts.output
    ? path.join(path.dirname(outputPath), 'predictions.jsonl')
    : path.join(resultsDir, `predictions-${timestamp}.jsonl`)

  let modelId: string | undefined
  let providerId: string | undefined
  let reasoningLevel: string | undefined

  try {
    const config = loadConfig()
    modelId = config.model
    providerId = config.provider
    reasoningLevel = config.reasoningLevel
    const model = resolveModel(config)
    const apiKey = await resolveApiKey(config)

    let instances = await loadDataset(dataDir)

    if (opts.repos) {
      const repoSet = new Set(opts.repos)
      instances = instances.filter((instance) => repoSet.has(instance.repo))
    }

    if (opts.instanceIds) {
      const idSet = new Set(opts.instanceIds)
      instances = instances.filter((instance) => idSet.has(instance.instance_id))
    }

    if (opts.limit) {
      instances = instances.slice(0, opts.limit)
    }

    const total = instances.length
    console.log(`Solving ${total} SWE-bench instances...\n`)

    const results: SolveResult[] = []

    for (let i = 0; i < instances.length; i++) {
      const instance = instances[i]!
      const prefix = `[${i + 1}/${total}]`
      const start = Date.now()

      const result: SolveResult = {
        instance_id: instance.instance_id,
        repo: instance.repo,
        base_commit: instance.base_commit,
        model_patch: '',
        durationMs: 0,
        traceId: '',
      }

      try {
        const repoDir = prepareRepo(instance, reposDir)
        const prompt = buildPrompt(instance)
        const runResult = await runHeadless({ model, apiKey, config, prompt, cwd: repoDir })

        result.durationMs = Date.now() - start
        result.traceId = runResult.trace?.runId ?? ''
        result.model_patch = extractPatch(repoDir)
        resetRepo(repoDir, instance.base_commit)
      } catch (err) {
        result.durationMs = Date.now() - start
        result.error = err instanceof Error ? err.message : String(err)
      }

      results.push(result)

      const patched = result.model_patch.length > 0 ? 'patched=YES' : 'patched=NO'
      const dur = (result.durationMs / 1000).toFixed(1)
      const status = result.error ? `ERROR: ${result.error.slice(0, 60)}` : patched
      console.log(`${prefix} ${instance.instance_id}: ${status} (${dur}s)`)
    }

    await writePredictions(results, predictionsPath)

    const evalResult = buildSWEBenchEvalResult(results, {
      model: config.model,
      provider: config.provider,
      reasoningLevel: config.reasoningLevel,
      limit: opts.limit,
      repos: opts.repos,
      instanceIds: opts.instanceIds,
    })

    await writeResult(evalResult, outputPath)
    console.log(`Predictions written to ${predictionsPath}`)
    exitWithResult(evalResult)
  } catch (error) {
    const runtimeErrorResult = buildSWEBenchRuntimeErrorResult(error, {
      model: modelId,
      provider: providerId,
      reasoningLevel,
      limit: opts.limit,
      repos: opts.repos,
      instanceIds: opts.instanceIds,
      durationMs: Date.now() - startTime,
    })

    await writeResult(runtimeErrorResult, outputPath)
    console.log(`Predictions not written due to runtime error before solve completion`)
    exitWithResult(runtimeErrorResult)
  }
}

async function writePredictions(results: SolveResult[], predictionsPath: string): Promise<void> {
  const predictions = results.map((result) => {
    const prediction: SWEBenchPrediction = {
      instance_id: result.instance_id,
      model_name_or_path: 'codelord',
      model_patch: result.model_patch,
    }
    return JSON.stringify(prediction)
  })

  await fs.mkdir(path.dirname(predictionsPath), { recursive: true })
  await fs.writeFile(predictionsPath, `${predictions.join('\n')}\n`)
}

void main()
