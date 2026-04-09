import path from 'node:path'
import fs from 'node:fs/promises'

import { loadConfig } from '@codelord/config'
import { runHeadless, resolveModel, resolveApiKey } from '@codelord/coding-agent'

import type { SWEBenchInstance, SWEBenchPrediction, SolveResult, SolveSummary } from '../types.js'
import { loadDataset } from '../dataset.js'
import { prepareRepo, buildPrompt, extractPatch, resetRepo } from '../adapter.js'

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
  const opts = parseArgs(process.argv)
  const dataDir = opts.dataDir
  const reposDir = path.join(dataDir, 'repos')
  const resultsDir = path.join(dataDir, 'results')
  await fs.mkdir(reposDir, { recursive: true })
  await fs.mkdir(resultsDir, { recursive: true })

  // Load config & model
  const config = loadConfig()
  const model = resolveModel(config)
  const apiKey = await resolveApiKey(config)

  // Load dataset
  let instances = await loadDataset(dataDir)

  // Filter by --repos
  if (opts.repos) {
    const repoSet = new Set(opts.repos)
    instances = instances.filter((i) => repoSet.has(i.repo))
  }

  // Filter by --instance-ids
  if (opts.instanceIds) {
    const idSet = new Set(opts.instanceIds)
    instances = instances.filter((i) => idSet.has(i.instance_id))
  }

  // Apply --limit
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
      // Prepare repo checkout
      const repoDir = prepareRepo(instance, reposDir)

      // Build prompt and run agent
      const prompt = buildPrompt(instance)
      const r = await runHeadless({ model, apiKey, config, prompt, cwd: repoDir })

      result.durationMs = Date.now() - start
      result.traceId = r.trace?.runId ?? ''

      // Extract patch
      result.model_patch = extractPatch(repoDir)

      // Reset repo for next instance
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

  // --- Write outputs ---

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const predictionsPath = opts.output ?? path.join(resultsDir, `predictions-${timestamp}.jsonl`)
  const summaryPath = path.join(resultsDir, `solve-summary-${timestamp}.json`)

  // predictions.jsonl
  const predictions: string[] = results.map((r) => {
    const pred: SWEBenchPrediction = {
      instance_id: r.instance_id,
      model_name_or_path: 'codelord',
      model_patch: r.model_patch,
    }
    return JSON.stringify(pred)
  })
  await fs.writeFile(predictionsPath, predictions.join('\n') + '\n')

  // solve-summary.json
  const patchedCount = results.filter((r) => r.model_patch.length > 0).length
  const errorCount = results.filter((r) => r.error).length
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0)
  const summary: SolveSummary = {
    timestamp: new Date().toISOString(),
    totalInstances: total,
    patchedCount,
    errorCount,
    avgDurationMs: total > 0 ? totalDuration / total : 0,
    results,
  }
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2))

  // Print summary
  const emptyCount = total - patchedCount - errorCount
  const pctPatched = total > 0 ? ((patchedCount / total) * 100).toFixed(1) : '0.0'
  const pctEmpty = total > 0 ? ((emptyCount / total) * 100).toFixed(1) : '0.0'
  const pctError = total > 0 ? ((errorCount / total) * 100).toFixed(1) : '0.0'
  const avgDur = total > 0 ? (totalDuration / total / 1000).toFixed(1) : '0.0'

  console.log(`\n=== SWE-bench Solving Results ===`)
  console.log(`Total: ${total} | Patched: ${patchedCount} (${pctPatched}%) | Empty: ${emptyCount} (${pctEmpty}%) | Errors: ${errorCount} (${pctError}%)`)
  console.log(`Avg duration: ${avgDur}s`)
  console.log(`Predictions written to ${predictionsPath}`)
  console.log(`Summary written to ${summaryPath}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
