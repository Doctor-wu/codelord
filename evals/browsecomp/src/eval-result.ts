import { registerBenchmarkRenderer } from '@codelord/evals-shared'
import type { EvalCaseResult, EvalError, EvalResult } from '@codelord/evals-shared'

import type { BrowseCompResult } from './types.js'

export function registerBrowseCompRenderer(): void {
  registerBenchmarkRenderer('browsecomp', (result) => {
    const gradeBuckets = new Map<string, number>([
      ['CORRECT', 0],
      ['INCORRECT', 0],
      ['ERROR', 0],
    ])
    const confidenceBuckets = new Map<string, number>([
      ['0-25%', 0],
      ['26-50%', 0],
      ['51-75%', 0],
      ['76-100%', 0],
    ])

    for (const caseResult of result.cases) {
      const grade = typeof caseResult.metadata?.grade === 'string' ? caseResult.metadata.grade : 'ERROR'
      gradeBuckets.set(grade, (gradeBuckets.get(grade) ?? 0) + 1)

      const confidence = typeof caseResult.metadata?.confidence === 'number' ? caseResult.metadata.confidence : 0
      confidenceBuckets.set(resolveConfidenceBucket(confidence), (confidenceBuckets.get(resolveConfidenceBucket(confidence)) ?? 0) + 1)
    }

    const total = result.cases.length
    const lines = [
      '### BrowseComp Grade Distribution',
      '',
      '| grade | count | percentage |',
      '| --- | --- | --- |',
    ]

    for (const [grade, count] of gradeBuckets.entries()) {
      const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0'
      lines.push(`| ${grade} | ${count} | ${percentage}% |`)
    }

    lines.push('')
    lines.push('### BrowseComp Confidence Distribution')
    lines.push('')
    lines.push('| range | count |')
    lines.push('| --- | --- |')

    for (const [range, count] of confidenceBuckets.entries()) {
      lines.push(`| ${range} | ${count} |`)
    }

    return lines.join('\n')
  })
}

export function mapBrowseCompCase(result: BrowseCompResult): EvalCaseResult {
  return {
    id: String(result.id),
    passed: result.grade === 'CORRECT',
    durationMs: result.durationMs,
    error: result.error,
    metadata: {
      confidence: result.confidence,
      grade: result.grade,
      graderReasoning: result.graderReasoning,
      extractedAnswer: result.extractedAnswer,
      questionPreview: result.question.slice(0, 100),
    },
  }
}

export function buildBrowseCompEvalResult(
  results: BrowseCompResult[],
  context: {
    model: string
    provider: string
    reasoningLevel: string
    limit?: number
    offset?: number
    skipGrade: boolean
  },
): EvalResult {
  const total = results.length
  const correctCount = results.filter((result) => result.grade === 'CORRECT').length
  const incorrectCount = results.filter((result) => result.grade === 'INCORRECT').length
  const errorCount = results.filter((result) => result.grade === 'ERROR').length
  const durationMs = results.reduce((sum, result) => sum + result.durationMs, 0)
  const totalConfidence = results.reduce((sum, result) => sum + result.confidence, 0)

  return {
    benchmark: 'browsecomp',
    model: context.model,
    provider: context.provider,
    reasoningLevel: context.reasoningLevel,
    timestamp: new Date().toISOString(),
    config: {
      mode: context.limit ? 'subset' : 'full',
      limit: context.limit,
      offset: context.offset,
      skipGrade: context.skipGrade,
    },
    metrics: {
      accuracy: total > 0 ? correctCount / total : 0,
      total,
      correct_count: correctCount,
      incorrect_count: incorrectCount,
      error_count: errorCount,
      avg_confidence: total > 0 ? totalConfidence / total : 0,
      avg_duration_ms: total > 0 ? durationMs / total : 0,
    },
    cases: results.map(mapBrowseCompCase),
    durationMs,
  }
}

export function buildBrowseCompRuntimeErrorResult(
  error: unknown,
  context: {
    model?: string
    provider?: string
    reasoningLevel?: string
    limit?: number
    offset?: number
    skipGrade: boolean
    durationMs: number
  },
): EvalResult {
  return {
    benchmark: 'browsecomp',
    model: context.model ?? 'unknown',
    provider: context.provider ?? 'unknown',
    reasoningLevel: context.reasoningLevel ?? 'unknown',
    timestamp: new Date().toISOString(),
    config: {
      mode: context.limit ? 'subset' : 'full',
      limit: context.limit,
      offset: context.offset,
      skipGrade: context.skipGrade,
    },
    metrics: {},
    cases: [],
    errors: [normalizeError(error)],
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

function resolveConfidenceBucket(confidence: number): string {
  if (confidence <= 25) return '0-25%'
  if (confidence <= 50) return '26-50%'
  if (confidence <= 75) return '51-75%'
  return '76-100%'
}
