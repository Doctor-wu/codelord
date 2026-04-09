import path from 'node:path'
import fs from 'node:fs/promises'

import { loadConfig } from '@codelord/config'
import { runHeadless, resolveModel, resolveApiKey } from '@codelord/coding-agent'

import type { ExerciseResult, BenchmarkSummary, AttemptRecord } from '../types.js'
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

function buildSummary(results: ExerciseResult[]): BenchmarkSummary {
  const passAttempt1 = results.filter((r) => r.passedAttempt1).length
  const passAttempt2 = results.filter((r) => r.passedAttempt1 || r.passedAttempt2 === true).length
  const total = results.length

  const byLanguage: BenchmarkSummary['byLanguage'] = {}
  for (const r of results) {
    const lang = (byLanguage[r.language] ??= { total: 0, passAttempt1: 0, passAttempt2: 0, passRate1: 0, passRate2: 0 })
    lang.total++
    if (r.passedAttempt1) lang.passAttempt1++
    if (r.passedAttempt1 || r.passedAttempt2 === true) lang.passAttempt2++
  }
  for (const lang of Object.values(byLanguage)) {
    lang.passRate1 = lang.total > 0 ? lang.passAttempt1 / lang.total : 0
    lang.passRate2 = lang.total > 0 ? lang.passAttempt2 / lang.total : 0
  }

  return {
    timestamp: new Date().toISOString(),
    totalExercises: total,
    passAttempt1,
    passAttempt2,
    passRate1: total > 0 ? passAttempt1 / total : 0,
    passRate2: total > 0 ? passAttempt2 / total : 0,
    byLanguage,
    results,
  }
}

function printSummary(s: BenchmarkSummary) {
  const pct = (n: number) => (n * 100).toFixed(1) + '%'
  console.log('\n=== Polyglot Benchmark Results ===')
  console.log(`Total: ${s.totalExercises} | Pass@1: ${s.passAttempt1} (${pct(s.passRate1)}) | Pass@2: ${s.passAttempt2} (${pct(s.passRate2)})`)
  console.log('By language:')
  for (const [lang, data] of Object.entries(s.byLanguage)) {
    console.log(`  ${lang.padEnd(14)} ${data.total} exercises | Pass@1: ${data.passAttempt1} (${pct(data.passRate1)}) | Pass@2: ${data.passAttempt2} (${pct(data.passRate2)})`)
  }
}

// --- Main -------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv)

  // Verify benchmark dir exists
  try {
    await fs.stat(opts.benchmarkDir)
  } catch {
    console.error(`Benchmark directory not found: ${opts.benchmarkDir}`)
    console.error('Clone it first:')
    console.error('  git clone https://github.com/Aider-AI/polyglot-benchmark ' + opts.benchmarkDir)
    process.exit(1)
  }
  // Prepare headless environment
  const config = loadConfig()
  const model = resolveModel(config)
  const apiKey = await resolveApiKey(config)

  // Scan exercises
  let exercises = await scanExercises(opts.benchmarkDir, opts.languages)
  if (opts.limit) exercises = exercises.slice(0, opts.limit)

  const total = exercises.length
  console.log(`Found ${total} exercises.`)

  // Check language prerequisites
  const usedLanguages = [...new Set(exercises.map((e) => e.language))]
  const prereqErrors: string[] = []
  for (const lang of usedLanguages) {
    const err = checkLanguagePrereqs(lang)
    if (err) prereqErrors.push(`  ${lang}: ${err}`)
  }
  if (prereqErrors.length > 0) {
    console.error('Missing prerequisites:\n' + prereqErrors.join('\n'))
    console.error('\nInstall the missing tools and retry.')
    process.exit(1)
  }

  console.log('Starting benchmark...\n')

  const workdirsBase = path.resolve('./data/workdirs')
  await fs.mkdir(workdirsBase, { recursive: true })

  const results: ExerciseResult[] = []

  for (let i = 0; i < exercises.length; i++) {
    const exercise = exercises[i]!
    const prefix = `[${i + 1}/${total}] ${exercise.id}`
    const start = Date.now()

    // Copy exercise to temp working directory
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
      // --- Attempt 1 ---
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
      // --- Attempt 2 (only if attempt 1 failed) ---
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
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err)
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    const a1 = result.passedAttempt1 ? 'PASS' : 'FAIL'
    const a2 = result.passedAttempt2 === null ? '-' : result.passedAttempt2 ? 'PASS' : 'FAIL'
    console.log(`${prefix}: attempt1=${a1} attempt2=${a2} (${elapsed}s)`)

    results.push(result)
  }

  // --- Summary ---
  const summary = buildSummary(results)
  printSummary(summary)

  const outputPath = opts.output ?? `./data/results/polyglot-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`
  await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true })
  await fs.writeFile(path.resolve(outputPath), JSON.stringify(summary, null, 2))
  console.log(`\nResults written to ${outputPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
