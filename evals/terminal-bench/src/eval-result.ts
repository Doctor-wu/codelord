import { registerBenchmarkRenderer } from '@codelord/evals-shared'
import type { EvalCaseResult, EvalError, EvalResult } from '@codelord/evals-shared'

export interface HarborJobConfig {
  n_concurrent_trials?: number
  agents?: Array<{
    model_name?: string
    env?: {
      CODELORD_REASONING_LEVEL?: string
    }
  }>
  datasets?: Array<{
    n_tasks?: number | null
  }>
}

export interface HarborTrialPhase {
  started_at?: string | null
  finished_at?: string | null
}

export interface HarborTrialResult {
  task_name?: string
  trial_name?: string
  agent_result?: unknown | null
  verifier_result?: {
    reward?: number | null
    output?: string | null
  } | null
  exception_info?: {
    exception_type?: string | null
    exception_message?: string | null
  } | null
  started_at?: string | null
  finished_at?: string | null
  environment_setup?: HarborTrialPhase | null
  agent_setup?: HarborTrialPhase | null
  agent_execution?: HarborTrialPhase | null
}

interface TerminalBenchPhaseAverages {
  environmentSetupAvgMs: number | null
  agentSetupAvgMs: number | null
  agentExecutionAvgMs: number | null
}

export function registerTerminalBenchRenderer(): void {
  registerBenchmarkRenderer('terminal-bench', (result) => {
    const errorCounts = new Map<string, number>()
    const phaseAverages = computePhaseAverages(result.cases)

    for (const caseResult of result.cases) {
      const errorType =
        typeof caseResult.metadata?.exception_type === 'string'
          ? caseResult.metadata.exception_type
          : (caseResult.error ?? 'NONE')
      errorCounts.set(errorType, (errorCounts.get(errorType) ?? 0) + 1)
    }

    const total = result.cases.length
    const lines = [
      '### Terminal-Bench Error Distribution',
      '',
      '| error_type | count | percentage |',
      '| --- | --- | --- |',
    ]

    for (const [errorType, count] of [...errorCounts.entries()].toSorted(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0'
      lines.push(`| ${errorType} | ${count} | ${percentage}% |`)
    }

    lines.push('')
    lines.push('### Terminal-Bench Timing')
    lines.push('')
    lines.push('| phase | avg_duration |')
    lines.push('| --- | --- |')
    lines.push(`| environment_setup | ${formatDuration(phaseAverages.environmentSetupAvgMs)} |`)
    lines.push(`| agent_setup | ${formatDuration(phaseAverages.agentSetupAvgMs)} |`)
    lines.push(`| agent_execution | ${formatDuration(phaseAverages.agentExecutionAvgMs)} |`)

    return lines.join('\n')
  })
}

export function mapTerminalBenchCase(result: HarborTrialResult): EvalCaseResult {
  const exceptionType = result.exception_info?.exception_type ?? undefined
  const exceptionMessage = result.exception_info?.exception_message ?? undefined

  return {
    id: result.task_name ?? 'unknown-task',
    passed: result.verifier_result?.reward === 1.0,
    durationMs: calculateDurationMs(result.started_at, result.finished_at),
    error: exceptionType,
    metadata: {
      trial_name: result.trial_name ?? '',
      exception_type: exceptionType,
      exception_message: exceptionMessage,
      has_agent_result: result.agent_result !== undefined && result.agent_result !== null,
      has_verifier_result: result.verifier_result !== undefined && result.verifier_result !== null,
      verifier_reward: result.verifier_result?.reward ?? null,
      environment_setup_duration_ms: calculatePhaseDurationMs(result.environment_setup),
      agent_setup_duration_ms: calculatePhaseDurationMs(result.agent_setup),
      agent_execution_duration_ms: calculatePhaseDurationMs(result.agent_execution),
    },
  }
}

export function buildTerminalBenchEvalResult(
  results: HarborTrialResult[],
  context: {
    model: string
    provider: string
    reasoningLevel: string
    limit?: number
    nConcurrent?: number
  },
): EvalResult {
  const cases = results.map(mapTerminalBenchCase)
  const total = cases.length
  const passedCount = cases.filter((caseResult) => caseResult.passed).length
  const errorCount = cases.filter((caseResult) => caseResult.error).length
  const durationMs = cases.reduce((sum, caseResult) => sum + caseResult.durationMs, 0)

  return {
    benchmark: 'terminal-bench',
    model: context.model,
    provider: context.provider,
    reasoningLevel: context.reasoningLevel,
    timestamp: new Date().toISOString(),
    config: {
      mode: context.limit ? 'subset' : 'full',
      limit: context.limit,
      n_concurrent: context.nConcurrent,
    },
    metrics: {
      resolution_rate: total > 0 ? passedCount / total : 0,
      total,
      passed_count: passedCount,
      error_count: errorCount,
      setup_timeout_count: countByError(cases, 'AgentSetupTimeoutError'),
      cancelled_count: countByError(cases, 'CancelledError'),
    },
    cases,
    durationMs,
  }
}

export function buildTerminalBenchRuntimeErrorResult(
  error: unknown,
  context: {
    model?: string
    provider?: string
    reasoningLevel?: string
    limit?: number
    nConcurrent?: number
    durationMs: number
  },
): EvalResult {
  return {
    benchmark: 'terminal-bench',
    model: context.model ?? 'unknown',
    provider: context.provider ?? 'unknown',
    reasoningLevel: context.reasoningLevel ?? 'unknown',
    timestamp: new Date().toISOString(),
    config: {
      mode: context.limit ? 'subset' : 'full',
      limit: context.limit,
      n_concurrent: context.nConcurrent,
    },
    metrics: {},
    cases: [],
    errors: [normalizeError(error)],
    durationMs: context.durationMs,
  }
}

export function inferModelInfo(config: HarborJobConfig | undefined): {
  model: string
  provider: string
  reasoningLevel: string
  limit?: number
  nConcurrent?: number
} {
  const modelName = config?.agents?.[0]?.model_name ?? 'unknown/unknown'
  const [provider, ...rest] = modelName.split('/')
  const normalizedModel = rest.length > 0 ? rest.join('/') : modelName

  return {
    model: normalizedModel || 'unknown',
    provider: rest.length > 0 ? provider || 'unknown' : 'unknown',
    reasoningLevel: config?.agents?.[0]?.env?.CODELORD_REASONING_LEVEL ?? 'unknown',
    limit: config?.datasets?.[0]?.n_tasks ?? undefined,
    nConcurrent: config?.n_concurrent_trials,
  }
}

function computePhaseAverages(cases: EvalCaseResult[]): TerminalBenchPhaseAverages {
  return {
    environmentSetupAvgMs: averageMetadataNumber(cases, 'environment_setup_duration_ms'),
    agentSetupAvgMs: averageMetadataNumber(cases, 'agent_setup_duration_ms'),
    agentExecutionAvgMs: averageMetadataNumber(cases, 'agent_execution_duration_ms'),
  }
}

function averageMetadataNumber(cases: EvalCaseResult[], key: string): number | null {
  const values = cases
    .map((caseResult) => caseResult.metadata?.[key])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function countByError(cases: EvalCaseResult[], errorType: string): number {
  return cases.filter((caseResult) => caseResult.error === errorType).length
}

function calculatePhaseDurationMs(phase: HarborTrialPhase | null | undefined): number | null {
  if (!phase) return null
  const durationMs = calculateDurationMs(phase.started_at, phase.finished_at)
  return durationMs > 0 ? durationMs : null
}

function calculateDurationMs(startedAt?: string | null, finishedAt?: string | null): number {
  if (!startedAt || !finishedAt) return 0

  const start = Date.parse(startedAt)
  const end = Date.parse(finishedAt)

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0
  return end - start
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return '-'

  const totalSeconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds}s`
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
