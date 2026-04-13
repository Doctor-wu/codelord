import path from 'node:path'
import fs from 'node:fs/promises'

import { loadConfig } from '@codelord/config'
import { runHeadless, resolveModel, resolveApiKey } from '@codelord/coding-agent'
import { exitWithResult, registerBenchmarkRenderer, writeResult } from '@codelord/evals-shared'
import type { EvalCaseResult, EvalError, EvalResult } from '@codelord/evals-shared'

import type { ExerciseResult, AttemptRecord } from '../types.js'
import { scanExercises, buildPrompt, buildRetryPrompt, runTest, checkLanguagePrereqs } from '../adapters/polyglot/adapter.js'
import { copyExerciseDir } from '../adapters/polyglot/utils.js'

// --- CLI argument parsing ---------------------------------------------------

function parseArgs(argv: string[]) {
  const args = argv.slice(2)
  let benchmarkDir = './data/benchmarks/polyglot-benchmark'
  let languages: string[] | undefined
  let limit: number | undefined
  let output: string | undefined

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--benchmark-dir':
        benchmarkDir = args[++i]!
        break
      case '--languages':
        languages = args[++i]!.split(',').map((s) => s.trim())
        break
      case '--limit':
        limit = Number(args[++i])
        break
      case '--output':
        output = args[++i]!
        break
    }
  }

  return { benchmarkDir: path.resolve(benchmarkDir), languages, limit, output }
}

// --- Summary helpers --------------------------------------------------------

function registerPolyglotRenderer() {
  registerBenchmarkRenderer('polyglot', (result) => {
    const byLanguage = new Map<
      string,
      { total: number; passAttempt1: number; passAttempt2: number }
    >()

    for (const caseResult of result.cases) {
      const metadata = caseResult.metadata ?? {}
      const language = typeof metadata.language === 'string' ? metadata.language : 'unknown'
      const passedAttempt1 = metadata.passedAttempt1 === true
      const passedAttempt2 = metadata.passedAttempt2 === true || passedAttempt1
      const bucket = byLanguage.get(language) ?? { total: 0, passAttempt1: 0, passAttempt2: 0 }
      bucket.total++
      if (passedAttempt1) bucket.passAttempt1++
      if (passedAttempt2) bucket.passAttempt2++
      byLanguage.set(language, bucket)
    }

    if (byLanguage.size === 0) return ''

    const lines = [
      '### Polyglot Language Breakdown',
      '',
      '| language | total | pass@1 | pass@2 | pass_rate_1 | pass_rate_2 |',
      '| --- | --- | --- | --- | --- | --- |',
    ]

    for (const [language, stats] of [...byLanguage.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const passRate1 = stats.total > 0 ? stats.passAttempt1 / stats.total : 0
      const passRate2 = stats.total > 0 ? stats.passAttempt2 / stats.total : 0
      lines.push(
        `| ${language} | ${stats.total} | ${stats.passAttempt1} | ${stats.passAttempt2} | ${passRate1.toFixed(3)} | ${passRate2.toFixed(3)} |`,
      )
    }

    return lines.join('\n')
  })
}

function buildEvalResult(
  results: ExerciseResult[],
  context: {
    model: string
    provider: string
    reasoningLevel: string
    limit?: number
    languages?: string[]
  },
): EvalResult {
  const passAttempt1 = results.filter((r) => r.passedAttempt1).length
  const passAttempt2 = results.filter((r) => r.passedAttempt1 || r.passedAttempt2 === true).length
  const total = results.length

  return {
    benchmark: 'polyglot',
    model: context.model,
    provider: context.provider,
    reasoningLevel: context.reasoningLevel,
    timestamp: new Date().toISOString(),
    config: {
      mode: context.limit ? 'subset' : 'full',
      limit: context.limit,
      languages: context.languages,
    },
    metrics: {
      pass_rate_1: total > 0 ? passAttempt1 / total : 0,
      pass_rate_2: total > 0 ? passAttempt2 / total : 0,
      total,
      pass_attempt_1: passAttempt1,
      pass_attempt_2: passAttempt2,
    },
    cases: results.map(mapCaseResult),
    durationMs: results.reduce((sum, result) => sum + result.attempt1.durationMs + (result.attempt2?.durationMs ?? 0), 0),
  }
}

function mapCaseResult(result: ExerciseResult): EvalCaseResult {
  return {
    id: result.id,
    passed: result.passedAttempt1 || result.passedAttempt2 === true,
    durationMs: result.attempt1.durationMs + (result.attempt2?.durationMs ?? 0),
    error: result.error,
    metadata: {
      language: result.language,
      exerciseName: result.exerciseName,
      passedAttempt1: result.passedAttempt1,
      passedAttempt2: result.passedAttempt2,
      attempt1TraceId: result.attempt1.traceId,
      attempt2TraceId: result.attempt2?.traceId,
    },
  }
}

function buildRuntimeErrorResult(
  error: unknown,
  context: {
    model?: string
    provider?: string
    reasoningLevel?: string
    limit?: number
    languages?: string[]
    durationMs: number
  },
): EvalResult {
  const err = normalizeError(error)
  return {
    benchmark: 'polyglot',
    model: context.model ?? 'unknown',
    provider: context.provider ?? 'unknown',
    reasoningLevel: context.reasoningLevel ?? 'unknown',
    timestamp: new Date().toISOString(),
    config: {
      mode: context.limit ? 'subset' : 'full',
      limit: context.limit,
      languages: context.languages,
    },
    metrics: {},
    cases: [],
    errors: [err],
    durationMs: context.durationMs,
  }
}

function normalizeError(error: unknown): EvalError {
  if (error instanceof Error) {
    return {
      type: error.name || 'Error',
      message: error.message,
    }
  }
  return {
    type: 'Error',
    message: String(error),
  }
}

function resolveOutputPath(output?: string): string {
  return output ?? `./data/results/polyglot-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`
}

// --- Main -------------------------------------------------------------------

async function main() {
  registerPolyglotRenderer()

  const startTime = Date.now()
  const opts = parseArgs(process.argv)
  const outputPath = resolveOutputPath(opts.output)

  let modelId: string | undefined
  let providerId: string | undefined
  let reasoningLevel: string | undefined

  try {
    try {
      await fs.stat(opts.benchmarkDir)
    } catch {
      throw new Error(
        `Benchmark directory not found: ${opts.benchmarkDir}\nClone it first:\n  git clone https://github.com/Aider-AI/polyglot-benchmark ${opts.benchmarkDir}`,
      )
    }

    const config = loadConfig()
    modelId = config.model
    providerId = config.provider
    reasoningLevel = config.reasoningLevel
    const model = resolveModel(config)
    const apiKey = await resolveApiKey(config)

    let exercises = await scanExercises(opts.benchmarkDir, opts.languages)
    if (opts.limit) exercises = exercises.slice(0, opts.limit)

    const total = exercises.length
    console.log(`Found ${total} exercises.`)

    const usedLanguages = [...new Set(exercises.map((exercise) => exercise.language))]
    const prereqErrors: string[] = []
    for (const language of usedLanguages) {
      const err = checkLanguagePrereqs(language)
      if (err) prereqErrors.push(`  ${language}: ${err}`)
    }
    if (prereqErrors.length > 0) {
      throw new Error(`Missing prerequisites:\n${prereqErrors.join('\n')}\n\nInstall the missing tools and retry.`)
    }

    console.log('Starting benchmark...\n')

    const workdirsBase = path.resolve('./data/workdirs')
    await fs.mkdir(workdirsBase, { recursive: true })

    const results: ExerciseResult[] = []

    for (let i = 0; i < exercises.length; i++) {
      const exercise = exercises[i]!
      const prefix = `[${i + 1}/${total}] ${exercise.id}`
      const start = Date.now()

      const workDir = path.join(workdirsBase, exercise.id)
      await fs.rm(workDir, { recursive: true, force: true })
      await copyExerciseDir(exercise.exerciseDir, workDir)

      const workExercise = { ...exercise, exerciseDir: workDir }
      const result: ExerciseResult = {
        id: exercise.id,
        language: exercise.language,
        exerciseName: exercise.exerciseName,
        passedAttempt1: false,
        passedAttempt2: null,
        attempt1: { durationMs: 0, traceId: '', testOutput: '' },
      }

      try {
        const prompt1 = await buildPrompt(workExercise)
        const a1Start = Date.now()
        const r1 = await runHeadless({ model, apiKey, config, prompt: prompt1, cwd: workDir })
        const a1Duration = Date.now() - a1Start
        const test1 = runTest(workExercise)

        const attempt1: AttemptRecord = {
          durationMs: a1Duration,
          traceId: r1.trace?.runId ?? '',
          testOutput: test1.output,
        }
        result.attempt1 = attempt1
        result.passedAttempt1 = test1.passed

        if (!test1.passed) {
          const prompt2 = await buildRetryPrompt(workExercise, test1.output)
          const a2Start = Date.now()
          const r2 = await runHeadless({ model, apiKey, config, prompt: prompt2, cwd: workDir })
          const a2Duration = Date.now() - a2Start
          const test2 = runTest(workExercise)

          result.attempt2 = {
            durationMs: a2Duration,
            traceId: r2.trace?.runId ?? '',
            testOutput: test2.output,
          }
          result.passedAttempt2 = test2.passed
        }
      } catch (error) {
        result.error = error instanceof Error ? error.message : String(error)
      }

      const elapsed = ((Date.now() - start) / 1000).toFixed(1)
      const attempt1 = result.passedAttempt1 ? 'PASS' : 'FAIL'
      const attempt2 = result.passedAttempt2 === null ? '-' : result.passedAttempt2 ? 'PASS' : 'FAIL'
      console.log(`${prefix}: attempt1=${attempt1} attempt2=${attempt2} (${elapsed}s)`)

      results.push(result)
    }

    const evalResult = buildEvalResult(results, {
      model: config.model,
      provider: config.provider,
      reasoningLevel: config.reasoningLevel,
      limit: opts.limit,
      languages: opts.languages,
    })

    await writeResult(evalResult, outputPath)
    exitWithResult(evalResult)
  } catch (error) {
    const runtimeErrorResult = buildRuntimeErrorResult(error, {
      model: modelId,
      provider: providerId,
      reasoningLevel,
      limit: opts.limit,
      languages: opts.languages,
      durationMs: Date.now() - startTime,
    })

    await writeResult(runtimeErrorResult, outputPath)
    exitWithResult(runtimeErrorResult)
  }
}

void main()
