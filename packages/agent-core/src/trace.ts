// ---------------------------------------------------------------------------
// Trace Schema — structured run trace for observability
// ---------------------------------------------------------------------------

import type { UsageCostBreakdown } from './events.js'
import type { RedactionHit } from './redact.js'

// ---------------------------------------------------------------------------
// TraceEvent — individual events within a step
// ---------------------------------------------------------------------------

export interface TraceLLMCall {
  type: 'llm_call'
  model: string
  provider: string
  stopReason: string
  latencyMs: number
  usage: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    totalTokens: number
    cost: UsageCostBreakdown
  }
  timestamp: number
}

export interface TraceToolExecution {
  type: 'tool_execution'
  toolName: string
  phase: string
  isError: boolean
  durationMs: number
  route: { wasRouted: boolean; ruleId: string | null; originalToolName: string } | null
  safety: { riskLevel: string; allowed: boolean; ruleId: string } | null
  argsPreview: string
  resultPreview: string
  stdoutPreview: string
  stderrPreview: string
  timestamp: number
}

export interface TraceQueueMessage {
  type: 'queue_message'
  contentPreview: string
  enqueuedAt: number
  injectedAt: number
  waitMs: number
}

export interface TraceAskUser {
  type: 'ask_user'
  question: string
  whyAsk: string
  askedAt: number
  answeredAt: number | null
  waitMs: number | null
  answerPreview: string | null
}

export interface TraceUserInterrupt {
  type: 'user_interrupt'
  source: 'sigint' | 'api'
  requestedAt: number
  observedAt: number
}

export type TraceEvent =
  | TraceLLMCall
  | TraceToolExecution
  | TraceQueueMessage
  | TraceAskUser
  | TraceUserInterrupt

// ---------------------------------------------------------------------------
// TraceStep — one LLM call + its tool executions
// ---------------------------------------------------------------------------

export interface TraceStep {
  step: number
  startedAt: number
  endedAt: number | null
  events: TraceEvent[]
}

// ---------------------------------------------------------------------------
// TraceRun — top-level trace for one runtime.run() burst
// ---------------------------------------------------------------------------

export interface TraceRun {
  runId: string
  sessionId: string
  cwd: string
  provider: string
  model: string
  startedAt: number
  endedAt: number
  outcome: { type: string; text?: string; error?: string; reason?: string }
  systemPromptHash: string
  usageSummary: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    totalTokens: number
    cost: UsageCostBreakdown
    llmCalls: number
  }
  redactionSummary: RedactionHit[]
  steps: TraceStep[]
}
