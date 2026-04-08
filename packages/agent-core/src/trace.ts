// ---------------------------------------------------------------------------
// Trace v2 Schema — layered event ledger for cross-layer observability
// ---------------------------------------------------------------------------

import type { UsageCostBreakdown } from './events.js'
import type { RedactionHit } from './redact.js'

// ---------------------------------------------------------------------------
// Ledger event base — shared fields for cross-layer correlation
// ---------------------------------------------------------------------------

interface LedgerEventBase {
  eventId: number
  /** Global monotonic sequence within a single run (cross-layer) */
  seq: number
  type: string
  timestamp: number
  step: number
  turnId: string | null
  source: 'provider_stream' | 'agent_event' | 'lifecycle_event'
}

// ---------------------------------------------------------------------------
// Provider stream ledger events
// ---------------------------------------------------------------------------

export interface ProviderStreamTraceEvent extends LedgerEventBase {
  source: 'provider_stream'
  contentIndex: number | null
  toolCallId: string | null
  toolName: string | null
  deltaPreview: string | null
  contentPreview: string | null
  argsPreview: string | null
  stopReason: string | null
}

// ---------------------------------------------------------------------------
// Agent event ledger events
// ---------------------------------------------------------------------------

export interface AgentTraceEvent extends LedgerEventBase {
  source: 'agent_event'
  contentIndex: number | null
  toolCallId: string | null
  toolName: string | null
  deltaPreview: string | null
  riskLevel: string | null
  allowed: boolean | null
  isError: boolean | null
  resultPreview: string | null
}

// ---------------------------------------------------------------------------
// Lifecycle event ledger events
// ---------------------------------------------------------------------------

export interface LifecycleTraceEvent extends LedgerEventBase {
  source: 'lifecycle_event'
  turnId: string | null
  toolCallId: string | null
  toolName: string | null
  phase: string | null
  reason: string | null
  question: string | null
  usageSnapshot: { input: number; output: number; cacheRead: number; cacheWrite: number; totalTokens: number; cost: UsageCostBreakdown } | null
  /** For queue_drained: declared count of drained messages */
  count: number | null
  /** For queue_drained: actual number of message entries recorded */
  messageCount: number | null
  /** For interrupt_requested / interrupt_observed: interrupt source */
  interruptSource: 'sigint' | 'api' | null
  /** For interrupt_observed: when the request was originally made */
  requestedAt: number | null
  /** For interrupt_observed: when the runtime observed it */
  observedAt: number | null
  /** For interrupt_observed: latency between request and observation */
  latencyMs: number | null
  /** For context_truncated */
  droppedCount: number | null
  /** For context_truncated */
  droppedTokens: number | null
  /** For checkpoint_created / checkpoint_undone */
  checkpointId: string | null
  /** For checkpoint_created: number of files protected */
  fileCount: number | null
}

// ---------------------------------------------------------------------------
// Unified event entry — union of all trace event types
// ---------------------------------------------------------------------------

/** Union of all trace event types */
export type TraceEventEntry = ProviderStreamTraceEvent | AgentTraceEvent | LifecycleTraceEvent

// ---------------------------------------------------------------------------
// TraceStepV2
// ---------------------------------------------------------------------------

export interface TraceStepV2 {
  step: number
  turnId: string | null
  startedAt: number
  endedAt: number | null
  events: TraceEventEntry[]
}

// ---------------------------------------------------------------------------
// TraceRunV2 — top-level trace
// ---------------------------------------------------------------------------

export interface TraceRunV2 {
  version: 2
  runId: string
  sessionId: string
  workspaceRoot: string
  workspaceSlug: string
  workspaceId: string
  cwd: string
  provider: string
  model: string
  systemPromptHash: string
  startedAt: number
  endedAt: number
  outcome: { type: string; text?: string; error?: string; reason?: string }
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
  eventCounts: { providerStream: number; agentEvents: number; lifecycleEvents: number }
  steps: TraceStepV2[]
  /** Events that occurred outside any step (run-level) */
  runEvents: TraceEventEntry[]
  /** Tool call success/failure stats for this run */
  toolStats?: { tools: Record<string, { attempts: number; successes: number; failures: number; errorCodes: Record<string, number> }>; routes: Record<string, { hits: number; successes: number; failures: number }> }
  /** Diagnostic: tool visibility latency metrics (computed at finalize time) */
  toolVisibility?: {
    avgProviderToLifecycleMs: number
    maxProviderToLifecycleMs: number
    measuredCount: number
    provisionalHitCount: number
  }
}

// ---------------------------------------------------------------------------
// V1 compat — keep old types as aliases so existing tests compile
// ---------------------------------------------------------------------------

export interface TraceLLMCall {
  type: 'llm_call'
  model: string
  provider: string
  stopReason: string
  latencyMs: number
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number; totalTokens: number; cost: UsageCostBreakdown }
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

export type TraceEvent = TraceLLMCall | TraceToolExecution | TraceQueueMessage | TraceAskUser | TraceUserInterrupt

export interface TraceStep {
  step: number
  startedAt: number
  endedAt: number | null
  events: TraceEvent[]
}

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
  usageSummary: { input: number; output: number; cacheRead: number; cacheWrite: number; totalTokens: number; cost: UsageCostBreakdown; llmCalls: number }
  redactionSummary: RedactionHit[]
  steps: TraceStep[]
}

// ---------------------------------------------------------------------------
// Normalize — backfill missing seq for old traces
// ---------------------------------------------------------------------------

/**
 * Normalize a trace for show: backfill missing `seq` with index-based
 * values so downstream code never sees undefined. Also converts old ledgers
 * format to unified events array for backward compatibility. Returns a shallow copy.
 */
export function normalizeTrace(trace: TraceRunV2): TraceRunV2 {
  let globalSeq = 0

  function backfillLifecycle(e: any): LifecycleTraceEvent {
    return { ...e, seq: e.seq ?? ++globalSeq, count: e.count ?? null, messageCount: e.messageCount ?? null, interruptSource: e.interruptSource ?? null, requestedAt: e.requestedAt ?? null, observedAt: e.observedAt ?? null, latencyMs: e.latencyMs ?? null, checkpointId: e.checkpointId ?? null, fileCount: e.fileCount ?? null }
  }

  const steps = trace.steps.map(step => {
    const oldLedgers = (step as any).ledgers
    let events: TraceEventEntry[]
    if (oldLedgers && !step.events) {
      const ps = (oldLedgers.providerStream ?? []).map((e: any) => ({ ...e, seq: e.seq ?? ++globalSeq }))
      const ae = (oldLedgers.agentEvents ?? []).map((e: any) => ({ ...e, seq: e.seq ?? ++globalSeq }))
      const le = (oldLedgers.lifecycleEvents ?? []).map(backfillLifecycle)
      for (const e of [...ps, ...ae, ...le]) {
        if (e.seq > globalSeq) globalSeq = e.seq
      }
      events = [...ps, ...ae, ...le].sort((a, b) => a.seq - b.seq)
    } else {
      events = (step.events ?? []).map(e => {
        const patched = { ...e, seq: e.seq ?? ++globalSeq }
        if (patched.source === 'lifecycle_event') return backfillLifecycle(patched)
        return patched
      })
      for (const e of events) {
        if (e.seq > globalSeq) globalSeq = e.seq
      }
    }
    return { ...step, events }
  })

  const oldRunLE = (trace as any).runLifecycleEvents
  let runEvents: TraceEventEntry[]
  if (oldRunLE && !trace.runEvents) {
    runEvents = oldRunLE.map(backfillLifecycle)
  } else {
    runEvents = (trace.runEvents ?? []).map((e: any) => {
      if (e.source === 'lifecycle_event') return backfillLifecycle(e)
      return { ...e, seq: e.seq ?? ++globalSeq }
    })
  }

  return { ...trace, steps, runEvents }
}
