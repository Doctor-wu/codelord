import fs from 'node:fs/promises'
import path from 'node:path'

import type { EvalResult } from '../evals/shared/src/types.js'

type BenchmarkId = EvalResult['benchmark']

interface ScoreEntry {
  label: string
  timestamp: string
  date: string
  model: string
  mode: string
  cases: number
  primaryMetricKey: string
  metrics: Record<string, number>
  sourceLabel: string
  runUrl?: string
}

interface ScoresState {
  version: 1
  lastUpdated: string
  history: Record<BenchmarkId, ScoreEntry[]>
}

interface ParsedArgs {
  init: boolean
  render: boolean
  benchmark?: BenchmarkId
  resultsPath?: string
  runUrl?: string
}

const SCORES_DIR = path.resolve('docs/scores')
const SCORES_MD_PATH = path.resolve('docs/scores.md')
const MAX_HISTORY = 10
const BENCHMARK_ORDER: BenchmarkId[] = ['polyglot', 'swe-bench', 'browsecomp', 'terminal-bench']

const BENCHMARK_TITLES: Record<BenchmarkId, string> = {
  polyglot: 'Polyglot',
  'swe-bench': 'SWE-bench',
  browsecomp: 'BrowseComp',
  'terminal-bench': 'Terminal-Bench',
}

const PRIMARY_METRICS: Record<BenchmarkId, string> = {
  polyglot: 'pass_rate_1',
  'swe-bench': 'patch_rate',
  browsecomp: 'accuracy',
  'terminal-bench': 'resolution_rate',
}

// ---------------------------------------------------------------------------
// Per-benchmark JSON file I/O
// ---------------------------------------------------------------------------

function benchmarkJsonPath(benchmark: BenchmarkId): string {
  return path.join(SCORES_DIR, `${benchmark}.json`)
}

export async function readBenchmarkEntries(benchmark: BenchmarkId): Promise<ScoreEntry[]> {
  try {
    const raw = await fs.readFile(benchmarkJsonPath(benchmark), 'utf8')
    return JSON.parse(raw) as ScoreEntry[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

export async function writeBenchmarkEntries(benchmark: BenchmarkId, entries: ScoreEntry[]): Promise<void> {
  await fs.mkdir(SCORES_DIR, { recursive: true })
  await fs.writeFile(benchmarkJsonPath(benchmark), `${JSON.stringify(entries, null, 2)}\n`, 'utf8')
}

export async function readAllBenchmarkStates(): Promise<ScoresState> {
  const history: ScoresState['history'] = {} as ScoresState['history']
  let latestDate = '1970-01-01'

  for (const benchmark of BENCHMARK_ORDER) {
    const entries = await readBenchmarkEntries(benchmark)
    history[benchmark] = entries
    for (const entry of entries) {
      if (entry.date > latestDate) latestDate = entry.date
    }
  }

  return { version: 1, lastUpdated: latestDate, history }
}

// ---------------------------------------------------------------------------
// In-memory state helpers (for tests / programmatic use)
// ---------------------------------------------------------------------------

export function buildInitialScoresState(now = '2026-04-12T00:00:00Z'): ScoresState {
  const history: ScoresState['history'] = {
    polyglot: [
      createManualEntry({
        benchmark: 'polyglot',
        label: 'Polyglot',
        timestamp: '2026-04-12T00:00:00Z',
        model: 'claude-sonnet-4-6',
        mode: 'subset',
        cases: 20,
        primaryMetricKey: 'pass_rate_1',
        metrics: {
          pass_rate_1: 1,
        },
      }),
      createManualEntry({
        benchmark: 'polyglot',
        label: 'Polyglot (Rust)',
        timestamp: '2026-04-12T00:00:00Z',
        model: 'claude-sonnet-4-6',
        mode: 'subset',
        cases: 30,
        primaryMetricKey: 'pass_rate_1',
        metrics: {
          pass_rate_1: 0.933,
          pass_rate_2: 0.967,
        },
      }),
    ],
    'swe-bench': [
      createManualEntry({
        benchmark: 'swe-bench',
        label: 'SWE-bench',
        timestamp: '2026-04-12T00:00:00Z',
        model: 'claude-sonnet-4-6',
        mode: 'subset',
        cases: 5,
        primaryMetricKey: 'patch_rate',
        metrics: {
          patch_rate: 0.2,
        },
      }),
    ],
    browsecomp: [
      createManualEntry({
        benchmark: 'browsecomp',
        label: 'BrowseComp',
        timestamp: '2026-04-12T00:00:00Z',
        model: 'claude-sonnet-4-6',
        mode: 'subset',
        cases: 5,
        primaryMetricKey: 'accuracy',
        metrics: {
          accuracy: 0.4,
        },
      }),
    ],
    'terminal-bench': [
      createManualEntry({
        benchmark: 'terminal-bench',
        label: 'Terminal-Bench',
        timestamp: '2026-04-12T00:00:00Z',
        model: 'claude-sonnet-4-6',
        mode: 'subset',
        cases: 3,
        primaryMetricKey: 'resolution_rate',
        metrics: {
          resolution_rate: 1 / 3,
        },
      }),
    ],
  }

  return {
    version: 1,
    lastUpdated: toDate(now),
    history,
  }
}

export function updateBenchmarkEntries(
  currentEntries: ScoreEntry[],
  benchmark: BenchmarkId,
  result: EvalResult,
  runUrl?: string,
): ScoreEntry[] {
  const entry = createEntryFromEvalResult(benchmark, result, runUrl)
  return [entry, ...currentEntries].slice(0, MAX_HISTORY)
}

/** @deprecated Use updateBenchmarkEntries for per-file updates. Kept for test compat. */
export function updateScoresState(
  currentState: ScoresState,
  benchmark: BenchmarkId,
  result: EvalResult,
  runUrl?: string,
): ScoresState {
  const nextEntries = updateBenchmarkEntries(currentState.history[benchmark] ?? [], benchmark, result, runUrl)

  return {
    ...currentState,
    lastUpdated: toDate(result.timestamp),
    history: {
      ...currentState.history,
      [benchmark]: nextEntries,
    },
  }
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

export function renderScoresMarkdown(state: ScoresState): string {
  const lines: string[] = [
    '# Codelord Eval Scores',
    '',
    '> 由 CI 自动更新。手动更新请运行 `pnpm update-scores`。',
    '',
    '## 总览',
    '',
    '| Benchmark | Model | Primary Metric | Value | Cases | Mode | Date | Source |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ]

  for (const entry of buildOverviewEntries(state)) {
    lines.push(
      `| ${entry.label} | ${entry.model} | ${entry.primaryMetricKey} | ${formatMetric(entry.primaryMetricKey, entry.metrics[entry.primaryMetricKey])} | ${entry.cases} | ${entry.mode} | ${entry.date} | ${renderSource(entry)} |`,
    )
  }

  for (const benchmark of BENCHMARK_ORDER) {
    lines.push('')
    lines.push(`## ${BENCHMARK_TITLES[benchmark]}`)
    lines.push('')
    lines.push('### Latest')
    lines.push('')

    const latestEntries = buildLatestEntries(state.history[benchmark] ?? [])
    if (latestEntries.length === 0) {
      lines.push('_No data yet._')
    } else {
      lines.push('| Label | Model | Primary Metric | Value | Cases | Mode | Date | Source |')
      lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
      for (const entry of latestEntries) {
        lines.push(
          `| ${entry.label} | ${entry.model} | ${entry.primaryMetricKey} | ${formatMetric(entry.primaryMetricKey, entry.metrics[entry.primaryMetricKey])} | ${entry.cases} | ${entry.mode} | ${entry.date} | ${renderSource(entry)} |`,
        )
      }
    }

    lines.push('')
    lines.push('### History')
    lines.push('')

    if (benchmark === 'polyglot') {
      lines.push('| Date | Label | Model | pass_rate_1 | pass_rate_2 | Cases | Mode | Source |')
      lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
      for (const entry of (state.history.polyglot ?? []).slice(0, MAX_HISTORY)) {
        lines.push(
          `| ${entry.date} | ${entry.label} | ${entry.model} | ${formatMetric('pass_rate_1', entry.metrics.pass_rate_1)} | ${formatMetric('pass_rate_2', entry.metrics.pass_rate_2)} | ${entry.cases} | ${entry.mode} | ${renderSource(entry)} |`,
        )
      }
    } else if (benchmark === 'swe-bench') {
      lines.push('| Date | Model | patch_rate | Cases | Mode | Source |')
      lines.push('| --- | --- | --- | --- | --- | --- |')
      for (const entry of (state.history['swe-bench'] ?? []).slice(0, MAX_HISTORY)) {
        lines.push(
          `| ${entry.date} | ${entry.model} | ${formatMetric('patch_rate', entry.metrics.patch_rate)} | ${entry.cases} | ${entry.mode} | ${renderSource(entry)} |`,
        )
      }
    } else if (benchmark === 'browsecomp') {
      lines.push('| Date | Model | accuracy | avg_confidence | Cases | Mode | Source |')
      lines.push('| --- | --- | --- | --- | --- | --- | --- |')
      for (const entry of (state.history.browsecomp ?? []).slice(0, MAX_HISTORY)) {
        lines.push(
          `| ${entry.date} | ${entry.model} | ${formatMetric('accuracy', entry.metrics.accuracy)} | ${formatMetric('avg_confidence', entry.metrics.avg_confidence)} | ${entry.cases} | ${entry.mode} | ${renderSource(entry)} |`,
        )
      }
    } else {
      lines.push('| Date | Model | resolution_rate | Cases | Mode | Source |')
      lines.push('| --- | --- | --- | --- | --- | --- |')
      for (const entry of (state.history['terminal-bench'] ?? []).slice(0, MAX_HISTORY)) {
        lines.push(
          `| ${entry.date} | ${entry.model} | ${formatMetric('resolution_rate', entry.metrics.resolution_rate)} | ${entry.cases} | ${entry.mode} | ${renderSource(entry)} |`,
        )
      }
    }
  }

  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push(`*Last updated: ${state.lastUpdated}*`)
  lines.push('')

  return `${lines.join('\n')}\n`
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (args.init) {
    const state = buildInitialScoresState()
    for (const benchmark of BENCHMARK_ORDER) {
      await writeBenchmarkEntries(benchmark, state.history[benchmark])
    }
    const markdown = renderScoresMarkdown(state)
    await fs.writeFile(SCORES_MD_PATH, markdown, 'utf8')
    console.log(`Initialized per-benchmark JSONs in ${SCORES_DIR} and ${SCORES_MD_PATH}`)
    return
  }

  if (args.render) {
    const state = await readAllBenchmarkStates()
    await fs.writeFile(SCORES_MD_PATH, renderScoresMarkdown(state), 'utf8')
    console.log(`Rendered ${SCORES_MD_PATH} from per-benchmark JSONs`)
    return
  }

  if (!args.benchmark || !args.resultsPath) {
    throw new Error('--benchmark and --results are required unless --init or --render is used')
  }

  const currentEntries = await readBenchmarkEntries(args.benchmark)
  const result = JSON.parse(await fs.readFile(path.resolve(args.resultsPath), 'utf8')) as EvalResult
  const nextEntries = updateBenchmarkEntries(currentEntries, args.benchmark, result, args.runUrl)
  await writeBenchmarkEntries(args.benchmark, nextEntries)
  console.log(`Updated ${benchmarkJsonPath(args.benchmark)}`)
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { init: false, render: false }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--init') {
      parsed.init = true
      continue
    }
    if (arg === '--render') {
      parsed.render = true
      continue
    }

    const value = argv[index + 1]
    if (!value) {
      throw new Error(`Missing value for ${arg}`)
    }

    if (arg === '--benchmark') {
      parsed.benchmark = value as BenchmarkId
      index += 1
      continue
    }
    if (arg === '--results') {
      parsed.resultsPath = value
      index += 1
      continue
    }
    if (arg === '--run-url') {
      parsed.runUrl = value
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return parsed
}

function createEntryFromEvalResult(benchmark: BenchmarkId, result: EvalResult, runUrl?: string): ScoreEntry {
  const label = deriveLabel(benchmark, result)
  const primaryMetricKey = PRIMARY_METRICS[benchmark]

  return {
    label,
    timestamp: result.timestamp,
    date: toDate(result.timestamp),
    model: result.model,
    mode: result.config.mode,
    cases: getCasesCount(result),
    primaryMetricKey,
    metrics: normalizeMetrics(result.metrics),
    sourceLabel: runUrl ? 'CI run' : 'manual',
    runUrl,
  }
}

function deriveLabel(benchmark: BenchmarkId, result: EvalResult): string {
  if (benchmark !== 'polyglot') return BENCHMARK_TITLES[benchmark]

  const languages = result.config.languages
  if (Array.isArray(languages) && languages.length === 1) {
    return `Polyglot (${titleCase(String(languages[0]))})`
  }

  return 'Polyglot'
}

function getCasesCount(result: EvalResult): number {
  const total = result.metrics.total
  return typeof total === 'number' ? total : result.cases.length
}

function normalizeMetrics(metrics: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(metrics).filter(([, value]) => typeof value === 'number' && Number.isFinite(value)),
  )
}

function createManualEntry(input: {
  benchmark: BenchmarkId
  label: string
  timestamp: string
  model: string
  mode: string
  cases: number
  primaryMetricKey: string
  metrics: Record<string, number>
}): ScoreEntry {
  return {
    label: input.label,
    timestamp: input.timestamp,
    date: toDate(input.timestamp),
    model: input.model,
    mode: input.mode,
    cases: input.cases,
    primaryMetricKey: input.primaryMetricKey,
    metrics: input.metrics,
    sourceLabel: 'M3-S1 manual',
  }
}

function buildOverviewEntries(state: ScoresState): ScoreEntry[] {
  const entries: ScoreEntry[] = []
  for (const benchmark of BENCHMARK_ORDER) {
    entries.push(...buildLatestEntries(state.history[benchmark] ?? []))
  }
  return entries
}

function buildLatestEntries(entries: ScoreEntry[]): ScoreEntry[] {
  const seenLabels = new Set<string>()
  const latestEntries: ScoreEntry[] = []
  for (const entry of entries) {
    if (seenLabels.has(entry.label)) continue
    seenLabels.add(entry.label)
    latestEntries.push(entry)
  }
  return latestEntries
}

function renderSource(entry: ScoreEntry): string {
  if (entry.runUrl) {
    return `[CI run](${entry.runUrl})`
  }
  return entry.sourceLabel
}

function toDate(timestamp: string): string {
  return timestamp.slice(0, 10)
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function formatMetric(metricKey: string, value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-'
  }

  const percentMetrics = new Set([
    'pass_rate_1',
    'pass_rate_2',
    'patch_rate',
    'accuracy',
    'resolution_rate',
    'avg_confidence',
  ])

  if (percentMetrics.has(metricKey)) {
    const normalized = metricKey === 'avg_confidence' && value > 1 ? value : value * 100
    return `${normalized.toFixed(1)}%`
  }

  return `${value}`
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
