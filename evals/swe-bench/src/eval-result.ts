import { registerBenchmarkRenderer } from '@codelord/evals-shared'
import type { EvalCaseResult, EvalError, EvalResult } from '@codelord/evals-shared'

import type { SolveResult } from './types.js'

export function registerSWEBenchRenderer(): void {
  registerBenchmarkRenderer('swe-bench', (result) => {
    const byRepo = new Map<string, { total: number; patched: number }>()

    for (const caseResult of result.cases) {
      const repo = typeof caseResult.metadata?.repo === 'string' ? caseResult.metadata.repo : 'unknown'
      const bucket = byRepo.get(repo) ?? { total: 0, patched: 0 }
      bucket.total += 1
      if (caseResult.passed) bucket.patched += 1
      byRepo.set(repo, bucket)
    }

    if (byRepo.size === 0) return ''

    const lines = [
      '### SWE-bench by Repository',
      '',
      '| repo | total | patched | patch_rate |',
      '| --- | --- | --- | --- |',
    ]

    for (const [repo, stats] of [...byRepo.entries()].toSorted(([left], [right]) => left.localeCompare(right))) {
      const patchRate = stats.total > 0 ? stats.patched / stats.total : 0
      lines.push(`| ${repo} | ${stats.total} | ${stats.patched} | ${patchRate.toFixed(3)} |`)
    }

    return lines.join('\n')
  })
}

export function buildSWEBenchEvalResult(
  results: SolveResult[],
  context: {
    model: string
    provider: string
    reasoningLevel: string
    limit?: number
    repos?: string[]
    instanceIds?: string[]
  },
): EvalResult {
  const total = results.length
  const patchedCount = results.filter((result) => result.model_patch.length > 0).length
  const errorCount = results.filter((result) => result.error).length
  const durationMs = results.reduce((sum, result) => sum + result.durationMs, 0)

  return {
    benchmark: 'swe-bench',
    model: context.model,
    provider: context.provider,
    reasoningLevel: context.reasoningLevel,
    timestamp: new Date().toISOString(),
    config: {
      mode: context.limit ? 'subset' : 'full',
      limit: context.limit,
      repos: context.repos,
      instanceIds: context.instanceIds,
    },
    metrics: {
      patch_rate: total > 0 ? patchedCount / total : 0,
      total,
      patched_count: patchedCount,
      error_count: errorCount,
      avg_duration_ms: total > 0 ? durationMs / total : 0,
    },
    cases: results.map(mapCaseResult),
    durationMs,
  }
}

export function buildSWEBenchRuntimeErrorResult(
  error: unknown,
  context: {
    model?: string
    provider?: string
    reasoningLevel?: string
    limit?: number
    repos?: string[]
    instanceIds?: string[]
    durationMs: number
  },
): EvalResult {
  return {
    benchmark: 'swe-bench',
    model: context.model ?? 'unknown',
    provider: context.provider ?? 'unknown',
    reasoningLevel: context.reasoningLevel ?? 'unknown',
    timestamp: new Date().toISOString(),
    config: {
      mode: context.limit ? 'subset' : 'full',
      limit: context.limit,
      repos: context.repos,
      instanceIds: context.instanceIds,
    },
    metrics: {},
    cases: [],
    errors: [normalizeError(error)],
    durationMs: context.durationMs,
  }
}

function mapCaseResult(result: SolveResult): EvalCaseResult {
  return {
    id: result.instance_id,
    passed: result.model_patch.length > 0,
    durationMs: result.durationMs,
    error: result.error,
    metadata: {
      repo: result.repo,
      base_commit: result.base_commit,
      patch_length: result.model_patch.length,
      traceId: result.traceId,
    },
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
