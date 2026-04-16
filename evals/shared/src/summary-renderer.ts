import type { EvalResult } from './types.js'

type BenchmarkRenderer = (result: EvalResult) => string

const benchmarkRenderers = new Map<string, BenchmarkRenderer>()

export function registerBenchmarkRenderer(benchmark: string, renderer: BenchmarkRenderer): void {
  benchmarkRenderers.set(benchmark, renderer)
}

export function renderSummaryMarkdown(result: EvalResult): string {
  const lines: string[] = [
    `## 🧪 Eval Results: ${result.benchmark}`,
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| model | ${escapeCell(result.model)} |`,
    `| provider | ${escapeCell(result.provider)} |`,
    `| reasoningLevel | ${escapeCell(result.reasoningLevel)} |`,
    `| mode | ${escapeCell(result.config.mode)} |`,
    `| limit | ${escapeCell(renderUnknown(result.config.limit))} |`,
  ]

  for (const [key, value] of Object.entries(result.config)) {
    if (key === 'mode' || key === 'limit') continue
    lines.push(`| config.${escapeCell(key)} | ${escapeCell(renderUnknown(value))} |`)
  }

  for (const [key, value] of Object.entries(result.metrics)) {
    lines.push(`| ${escapeCell(key)} | ${escapeCell(String(value))} |`)
  }

  lines.push(`| durationMs | ${escapeCell(String(result.durationMs))} |`)
  lines.push(`| timestamp | ${escapeCell(result.timestamp)} |`)
  lines.push('')
  lines.push('| id | passed | durationMs | error |')
  lines.push('| --- | --- | --- | --- |')

  for (const caseResult of result.cases) {
    lines.push(
      `| ${escapeCell(caseResult.id)} | ${caseResult.passed ? '✅' : '❌'} | ${escapeCell(String(caseResult.durationMs))} | ${escapeCell(caseResult.error ?? '')} |`,
    )
  }

  if (result.errors?.length) {
    lines.push('')
    lines.push('### Run Errors')
    lines.push('')
    lines.push('| type | message | caseId |')
    lines.push('| --- | --- | --- |')
    for (const error of result.errors) {
      lines.push(`| ${escapeCell(error.type)} | ${escapeCell(error.message)} | ${escapeCell(error.caseId ?? '')} |`)
    }
  }

  const extension = benchmarkRenderers.get(result.benchmark)?.(result)?.trim()
  if (extension) {
    lines.push('')
    lines.push(extension)
  }

  return `${lines.join('\n')}\n`
}

function renderUnknown(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map(renderUnknown).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, '<br/>')
}
