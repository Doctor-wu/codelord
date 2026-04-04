// ---------------------------------------------------------------------------
// Trace Check — structural and semantic validation of a trace run
// ---------------------------------------------------------------------------

import type { TraceRunV2, TraceStepV2, LifecycleTraceEvent, ProviderStreamTraceEvent, AgentTraceEvent } from './trace.js'

// ---------------------------------------------------------------------------
// Check result types
// ---------------------------------------------------------------------------

export type CheckSeverity = 'error' | 'warning' | 'diagnostic'

export interface CheckIssue {
  severity: CheckSeverity
  step: number | null
  rule: string
  message: string
  /** Sequence number of the offending event (if applicable) */
  seq: number | null
  /** Source layer of the offending event (if applicable) */
  source: string | null
}

export interface CheckResult {
  passed: boolean
  issues: CheckIssue[]
  errorCount: number
  warningCount: number
  diagnosticCount: number
}

// ---------------------------------------------------------------------------
// Normalize — backfill missing seq for old traces
// ---------------------------------------------------------------------------

/**
 * Normalize a trace for check/show: backfill missing `seq` with index-based
 * values so downstream code never sees undefined. Returns a shallow copy.
 */
export function normalizeTrace(trace: TraceRunV2): TraceRunV2 {
  let globalSeq = 0
  const steps = trace.steps.map(step => {
    const ps = step.ledgers.providerStream.map(e => ({ ...e, seq: e.seq ?? ++globalSeq }))
    const ae = step.ledgers.agentEvents.map(e => ({ ...e, seq: e.seq ?? ++globalSeq }))
    const le = step.ledgers.lifecycleEvents.map(e => ({ ...e, seq: e.seq ?? ++globalSeq, count: (e as any).count ?? null, messageCount: (e as any).messageCount ?? null, interruptSource: (e as any).interruptSource ?? null, requestedAt: (e as any).requestedAt ?? null, observedAt: (e as any).observedAt ?? null, latencyMs: (e as any).latencyMs ?? null }))
    for (const e of [...ps, ...ae, ...le]) {
      if (e.seq > globalSeq) globalSeq = e.seq
    }
    return { ...step, ledgers: { providerStream: ps, agentEvents: ae, lifecycleEvents: le } }
  })
  const runLE = (trace.runLifecycleEvents ?? []).map(e => ({ ...e, seq: e.seq ?? ++globalSeq, count: (e as any).count ?? null, messageCount: (e as any).messageCount ?? null, interruptSource: (e as any).interruptSource ?? null, requestedAt: (e as any).requestedAt ?? null, observedAt: (e as any).observedAt ?? null, latencyMs: (e as any).latencyMs ?? null }))
  return { ...trace, steps, runLifecycleEvents: runLE }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function checkTrace(trace: TraceRunV2): CheckResult {
  const normalized = normalizeTrace(trace)
  const issues: CheckIssue[] = []

  checkRunGlobalSeqMonotonic(normalized, issues)
  checkRunGlobalTimeOrder(normalized, issues)
  checkToolCallLifecycleOrder(normalized, issues)
  checkToolCallNoDuplicateCompleted(normalized, issues)
  checkProviderAgentToolCallCorrelation(normalized, issues)
  checkAgentLifecycleToolCallCorrelation(normalized, issues)
  checkAgentToolExecChain(normalized, issues)
  checkQuestionAnsweredChain(normalized, issues)
  checkQueueDrainedConsistency(normalized, issues)
  checkSessionDoneAfterLastStep(normalized, issues)
  checkInterruptChain(normalized, issues)
  checkStreamingDiagnostics(normalized, issues)

  const errorCount = issues.filter(i => i.severity === 'error').length
  const warningCount = issues.filter(i => i.severity === 'warning').length
  const diagnosticCount = issues.filter(i => i.severity === 'diagnostic').length

  return { passed: errorCount === 0, issues, errorCount, warningCount, diagnosticCount }
}

// ---------------------------------------------------------------------------
// Run-wide merged event view
// ---------------------------------------------------------------------------

interface MergedEvent {
  seq: number
  timestamp: number
  type: string
  source: string
  step: number | null
  event: LifecycleTraceEvent | ProviderStreamTraceEvent | AgentTraceEvent
}

/** Build a run-wide merged event view: all step events + runLifecycleEvents, sorted by seq */
function allRunEventsSorted(trace: TraceRunV2): MergedEvent[] {
  const events: MergedEvent[] = []
  for (const step of trace.steps) {
    for (const e of step.ledgers.providerStream) {
      events.push({ seq: e.seq, timestamp: e.timestamp, type: e.type, source: e.source, step: step.step, event: e })
    }
    for (const e of step.ledgers.agentEvents) {
      events.push({ seq: e.seq, timestamp: e.timestamp, type: e.type, source: e.source, step: step.step, event: e })
    }
    for (const e of step.ledgers.lifecycleEvents) {
      events.push({ seq: e.seq, timestamp: e.timestamp, type: e.type, source: e.source, step: step.step, event: e })
    }
  }
  for (const e of trace.runLifecycleEvents ?? []) {
    events.push({ seq: e.seq, timestamp: e.timestamp, type: e.type, source: e.source, step: null, event: e })
  }
  events.sort((a, b) => a.seq - b.seq)
  return events
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** Merge all events in a step, sorted by seq */
function allEventsSorted(step: TraceStepV2) {
  return [
    ...step.ledgers.providerStream,
    ...step.ledgers.agentEvents,
    ...step.ledgers.lifecycleEvents,
  ].sort((a, b) => a.seq - b.seq)
}

function issue(severity: CheckSeverity, step: number | null, rule: string, message: string, seq?: number | null, source?: string | null): CheckIssue {
  return { severity, step, rule, message, seq: seq ?? null, source: source ?? null }
}

/** Run-wide: global seq must be strictly monotonic across ALL events in the entire run */
function checkRunGlobalSeqMonotonic(trace: TraceRunV2, issues: CheckIssue[]): void {
  const sorted = allRunEventsSorted(trace)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].seq <= sorted[i - 1].seq) {
      issues.push(issue(
        'error',
        sorted[i].step,
        'run_global_seq_monotonic',
        `run-wide seq not monotonic: seq=${sorted[i].seq} (${sorted[i].source}:${sorted[i].type}) <= prev seq=${sorted[i - 1].seq} (${sorted[i - 1].source}:${sorted[i - 1].type})`,
        sorted[i].seq,
        sorted[i].source,
      ))
    }
  }
}

/** Run-wide: timestamps should not go backwards significantly across the entire run */
function checkRunGlobalTimeOrder(trace: TraceRunV2, issues: CheckIssue[]): void {
  const sorted = allRunEventsSorted(trace)
  for (let i = 1; i < sorted.length; i++) {
    const drift = sorted[i - 1].timestamp - sorted[i].timestamp
    if (drift > 100) {
      issues.push(issue(
        'warning',
        sorted[i].step,
        'run_global_time_order',
        `run-wide time reversal: seq=${sorted[i].seq} (${sorted[i].source}:${sorted[i].type}) timestamp is ${drift}ms before seq=${sorted[i - 1].seq} (${sorted[i - 1].source}:${sorted[i - 1].type})`,
        sorted[i].seq,
        sorted[i].source,
      ))
    }
  }
}

/** tool_call_completed must not appear before tool_call_created for same toolCallId */
function checkToolCallLifecycleOrder(trace: TraceRunV2, issues: CheckIssue[]): void {
  for (const step of trace.steps) {
    const created = new Map<string, number>()
    const completed = new Map<string, number>()
    for (const le of step.ledgers.lifecycleEvents) {
      if (le.type === 'tool_call_created' && le.toolCallId) created.set(le.toolCallId, le.seq)
      if (le.type === 'tool_call_completed' && le.toolCallId) completed.set(le.toolCallId, le.seq)
    }
    for (const [tcId, compSeq] of completed) {
      const crSeq = created.get(tcId)
      if (crSeq === undefined) {
        issues.push(issue('error', step.step, 'tc_completed_without_created', `tool_call_completed without prior tool_call_created (tc=${tcId.slice(0, 8)})`, compSeq, 'lifecycle_event'))
      } else if (compSeq < crSeq) {
        issues.push(issue('error', step.step, 'tc_completed_before_created', `tool_call_completed (seq=${compSeq}) before tool_call_created (seq=${crSeq}) (tc=${tcId.slice(0, 8)})`, compSeq, 'lifecycle_event'))
      }
    }
  }
}

/** Same toolCallId should not have multiple completed events in one step */
function checkToolCallNoDuplicateCompleted(trace: TraceRunV2, issues: CheckIssue[]): void {
  for (const step of trace.steps) {
    const counts = new Map<string, number>()
    for (const le of step.ledgers.lifecycleEvents) {
      if (le.type === 'tool_call_completed' && le.toolCallId) counts.set(le.toolCallId, (counts.get(le.toolCallId) ?? 0) + 1)
    }
    for (const [tcId, count] of counts) {
      if (count > 1) {
        issues.push(issue('error', step.step, 'tc_duplicate_completed', `tool_call_completed appears ${count} times for tc=${tcId.slice(0, 8)}`))
      }
    }
  }
}

/** provider toolcall_end should have corresponding agent toolcall_end */
function checkProviderAgentToolCallCorrelation(trace: TraceRunV2, issues: CheckIssue[]): void {
  for (const step of trace.steps) {
    const providerTcIds = new Set<string>()
    for (const pe of step.ledgers.providerStream) {
      if (pe.type === 'toolcall_end' && pe.toolCallId) providerTcIds.add(pe.toolCallId)
    }
    const agentTcIds = new Set<string>()
    for (const ae of step.ledgers.agentEvents) {
      if (ae.type === 'toolcall_end' && ae.toolCallId) agentTcIds.add(ae.toolCallId)
    }
    for (const tcId of providerTcIds) {
      if (!agentTcIds.has(tcId)) {
        issues.push(issue('warning', step.step, 'provider_agent_tc_mismatch', `provider toolcall_end for tc=${tcId.slice(0, 8)} has no matching agent toolcall_end`))
      }
    }
  }
}

/** agent toolcall_end should have corresponding lifecycle tool_call_created */
function checkAgentLifecycleToolCallCorrelation(trace: TraceRunV2, issues: CheckIssue[]): void {
  for (const step of trace.steps) {
    const agentTcIds = new Set<string>()
    for (const ae of step.ledgers.agentEvents) {
      if (ae.type === 'toolcall_end' && ae.toolCallId) agentTcIds.add(ae.toolCallId)
    }
    const lifecycleTcIds = new Set<string>()
    for (const le of step.ledgers.lifecycleEvents) {
      if (le.type === 'tool_call_created' && le.toolCallId) lifecycleTcIds.add(le.toolCallId)
    }
    for (const tcId of agentTcIds) {
      if (!lifecycleTcIds.has(tcId)) {
        issues.push(issue('warning', step.step, 'agent_lifecycle_tc_mismatch', `agent toolcall_end for tc=${tcId.slice(0, 8)} has no matching lifecycle tool_call_created`))
      }
    }
  }
}

/** agent tool_exec_start should have a corresponding tool_result, matched by toolCallId when available */
function checkAgentToolExecChain(trace: TraceRunV2, issues: CheckIssue[]): void {
  for (const step of trace.steps) {
    const starts: { key: string; label: string; seq: number }[] = []
    const resultKeys = new Set<string>()
    for (const ae of step.ledgers.agentEvents) {
      if (ae.type === 'tool_exec_start') {
        const key = ae.toolCallId ?? ae.toolName ?? `unknown:${ae.seq}`
        const label = ae.toolCallId ? `tc=${ae.toolCallId.slice(0, 8)}` : ae.toolName ?? 'unknown'
        starts.push({ key, label, seq: ae.seq })
      }
      if (ae.type === 'tool_result') {
        const key = ae.toolCallId ?? ae.toolName ?? `unknown:${ae.seq}`
        resultKeys.add(key)
      }
    }
    for (const s of starts) {
      if (!resultKeys.has(s.key)) {
        issues.push(issue('warning', step.step, 'tool_exec_no_result', `tool_exec_start (${s.label}, seq=${s.seq}) has no corresponding tool_result`, s.seq, 'agent_event'))
      }
    }
  }
}

/** question_answered should have a prior waiting_user / blocked_enter(waiting_user) */
function checkQuestionAnsweredChain(trace: TraceRunV2, issues: CheckIssue[]): void {
  let hasWaitingUser = false
  for (const step of trace.steps) {
    for (const le of step.ledgers.lifecycleEvents) {
      if (le.type === 'blocked_enter' && le.reason === 'waiting_user') hasWaitingUser = true
      if (le.type === 'question_answered') {
        if (!hasWaitingUser) {
          issues.push(issue('warning', step.step, 'question_answered_no_waiting', `question_answered without prior waiting_user`, le.seq, 'lifecycle_event'))
        }
        hasWaitingUser = false
      }
    }
  }
  for (const le of trace.runLifecycleEvents ?? []) {
    if (le.type === 'blocked_enter' && le.reason === 'waiting_user') hasWaitingUser = true
    if (le.type === 'question_answered') {
      if (!hasWaitingUser) {
        issues.push(issue('warning', null, 'question_answered_no_waiting', `question_answered without prior waiting_user (run-level)`, le.seq, 'lifecycle_event'))
      }
      hasWaitingUser = false
    }
  }
}

/** queue_drained count should match the number of messages recorded */
function checkQueueDrainedConsistency(trace: TraceRunV2, issues: CheckIssue[]): void {
  const allLE = [
    ...trace.steps.flatMap(s => s.ledgers.lifecycleEvents.map(le => ({ le, step: s.step }))),
    ...(trace.runLifecycleEvents ?? []).map(le => ({ le, step: null as number | null })),
  ]
  for (const { le, step } of allLE) {
    if (le.type !== 'queue_drained') continue
    if (le.count != null && le.messageCount != null && le.count !== le.messageCount) {
      issues.push(issue('error', step, 'queue_drained_count_mismatch', `queue_drained declared count=${le.count} but recorded ${le.messageCount} messages`, le.seq, 'lifecycle_event'))
    }
  }
}

/** session_done should not be timestamped before the last step's endedAt */
function checkSessionDoneAfterLastStep(trace: TraceRunV2, issues: CheckIssue[]): void {
  if (trace.steps.length === 0) return
  const lastStep = trace.steps[trace.steps.length - 1]
  if (!lastStep.endedAt) return

  for (const le of lastStep.ledgers.lifecycleEvents) {
    if (le.type === 'session_done' && le.timestamp < lastStep.endedAt) {
      issues.push(issue('warning', lastStep.step, 'session_done_before_step_end', `session_done timestamp (${le.timestamp}) is before step endedAt (${lastStep.endedAt})`, le.seq, 'lifecycle_event'))
    }
  }
  for (const le of trace.runLifecycleEvents ?? []) {
    if (le.type === 'session_done' && le.timestamp < lastStep.endedAt) {
      issues.push(issue('warning', null, 'session_done_before_step_end', `session_done timestamp (${le.timestamp}) is before last step endedAt (${lastStep.endedAt})`, le.seq, 'lifecycle_event'))
    }
  }
}

// ---------------------------------------------------------------------------
// Interrupt chain audit
// ---------------------------------------------------------------------------

/** Audit the interrupt chain: request → observed → blocked_enter(interrupted) */
function checkInterruptChain(trace: TraceRunV2, issues: CheckIssue[]): void {
  // Collect all interrupt-related events across the entire run
  const allLE = [
    ...trace.steps.flatMap(s => s.ledgers.lifecycleEvents.map(le => ({ le, step: s.step }))),
    ...(trace.runLifecycleEvents ?? []).map(le => ({ le, step: null as number | null })),
  ]

  const requests: { le: LifecycleTraceEvent; step: number | null }[] = []
  const observed: { le: LifecycleTraceEvent; step: number | null }[] = []
  const blockedInterrupted: { le: LifecycleTraceEvent; step: number | null }[] = []

  for (const { le, step } of allLE) {
    if (le.type === 'interrupt_requested') requests.push({ le, step })
    if (le.type === 'interrupt_observed') observed.push({ le, step })
    if (le.type === 'blocked_enter' && le.reason === 'interrupted') blockedInterrupted.push({ le, step })
  }

  // Rule: interrupt_requested without any subsequent interrupt_observed
  for (const req of requests) {
    const hasObserved = observed.some(o => o.le.seq > req.le.seq)
    if (!hasObserved) {
      issues.push(issue('warning', req.step, 'interrupt_requested_without_observed', `interrupt_requested (seq=${req.le.seq}) has no subsequent interrupt_observed`, req.le.seq, 'lifecycle_event'))
    }
  }

  // Rule: interrupt_observed without any prior interrupt_requested
  for (const obs of observed) {
    const hasRequest = requests.some(r => r.le.seq < obs.le.seq)
    if (!hasRequest) {
      issues.push(issue('error', obs.step, 'interrupt_observed_without_request', `interrupt_observed (seq=${obs.le.seq}) has no prior interrupt_requested`, obs.le.seq, 'lifecycle_event'))
    }
  }

  // Rule: interrupt_requested after interrupt_observed (order inversion)
  for (const req of requests) {
    const priorObserved = observed.find(o => o.le.seq < req.le.seq)
    if (priorObserved) {
      // Only flag if this request doesn't have its own observed after it
      const hasOwnObserved = observed.some(o => o.le.seq > req.le.seq)
      if (!hasOwnObserved) {
        issues.push(issue('error', req.step, 'interrupt_request_after_observed', `interrupt_requested (seq=${req.le.seq}) appears after interrupt_observed (seq=${priorObserved.le.seq})`, req.le.seq, 'lifecycle_event'))
      }
    }
  }

  // Rule: interrupt_observed without subsequent blocked_enter(interrupted)
  for (const obs of observed) {
    const hasBlocked = blockedInterrupted.some(b => b.le.seq > obs.le.seq)
    if (!hasBlocked) {
      issues.push(issue('warning', obs.step, 'interrupt_chain_missing_blocked_enter', `interrupt_observed (seq=${obs.le.seq}) has no subsequent blocked_enter(interrupted)`, obs.le.seq, 'lifecycle_event'))
    }
  }
}

// ---------------------------------------------------------------------------
// Streaming diagnostics — factual observations, not errors
// ---------------------------------------------------------------------------

/**
 * Streaming diagnostics: surface factual observations about the run's streaming
 * signature. These are not errors — they describe risk signatures that operators
 * and dogfooders should be aware of.
 */
function checkStreamingDiagnostics(trace: TraceRunV2, issues: CheckIssue[]): void {
  checkThinkingAbsent(trace, issues)
  checkToolcallDeltaDensity(trace, issues)
  checkPartialToLifecycleGap(trace, issues)
}

/**
 * thinking_absent: the entire run has no thinking_start / thinking_delta / thinking_end.
 * This is a factual observation — some providers don't emit thinking events, and that's
 * fine. But it means the UI had no raw thought stream to display, which can look like
 * the agent is "frozen" during long reasoning phases.
 */
function checkThinkingAbsent(trace: TraceRunV2, issues: CheckIssue[]): void {
  const thinkingTypes = new Set(['thinking_start', 'thinking_delta', 'thinking_end'])
  let hasThinking = false
  for (const step of trace.steps) {
    for (const pe of step.ledgers.providerStream) {
      if (thinkingTypes.has(pe.type)) { hasThinking = true; break }
    }
    if (hasThinking) break
  }
  if (!hasThinking) {
    issues.push(issue(
      'diagnostic', null, 'thinking_absent',
      'no thinking_start/delta/end events in the entire run — UI had no raw thought stream to display',
    ))
  }
}

/**
 * toolcall_delta_density_high: a single tool call has an unusually high density of
 * toolcall_delta events. This typically happens with large file writes where the
 * provider streams args in many small chunks.
 *
 * Threshold: >20 deltas within a 500ms window for a single toolCallId.
 * This is conservative — normal tool calls rarely exceed 10 deltas total.
 */
function checkToolcallDeltaDensity(trace: TraceRunV2, issues: CheckIssue[]): void {
  for (const step of trace.steps) {
    // Group toolcall_delta by toolCallId
    const deltasByTc = new Map<string, { timestamps: number[]; count: number }>()
    for (const pe of step.ledgers.providerStream) {
      if (pe.type === 'toolcall_delta' && pe.toolCallId) {
        let entry = deltasByTc.get(pe.toolCallId)
        if (!entry) { entry = { timestamps: [], count: 0 }; deltasByTc.set(pe.toolCallId, entry) }
        entry.timestamps.push(pe.timestamp)
        entry.count++
      }
    }
    for (const [tcId, { timestamps, count }] of deltasByTc) {
      if (count <= 20) continue
      // Check density: sort timestamps and find max count in any 500ms window
      timestamps.sort((a, b) => a - b)
      let maxInWindow = 0
      let windowStart = 0
      for (let i = 0; i < timestamps.length; i++) {
        while (timestamps[i] - timestamps[windowStart] > 500) windowStart++
        maxInWindow = Math.max(maxInWindow, i - windowStart + 1)
      }
      if (maxInWindow > 20) {
        const hz = Math.round(maxInWindow / 0.5)
        issues.push(issue(
          'diagnostic', step.step, 'toolcall_delta_density_high',
          `toolcall_delta density for tc=${tcId.slice(0, 8)}: ${maxInWindow} deltas in 500ms (~${hz} Hz), total ${count} deltas — may cause excessive UI redraws`,
        ))
      }
    }
  }
}

/**
 * partial_to_lifecycle_gap_large: the first raw provider toolcall_start/toolcall_delta
 * for a tool call arrives significantly before the lifecycle tool_call_created event.
 * This gap means the UI cannot show a proper tool card until the lifecycle event fires,
 * even though partial data is already streaming.
 *
 * Threshold: >300ms gap. In a healthy pipeline, lifecycle tool_call_created should
 * fire within ~50ms of the first raw partial.
 */
function checkPartialToLifecycleGap(trace: TraceRunV2, issues: CheckIssue[]): void {
  for (const step of trace.steps) {
    // Find first raw partial timestamp per toolCallId
    const firstPartial = new Map<string, number>()
    for (const pe of step.ledgers.providerStream) {
      if ((pe.type === 'toolcall_start' || pe.type === 'toolcall_delta') && pe.toolCallId) {
        if (!firstPartial.has(pe.toolCallId)) firstPartial.set(pe.toolCallId, pe.timestamp)
      }
    }
    // Find lifecycle tool_call_created timestamp per toolCallId
    const lifecycleCreated = new Map<string, number>()
    for (const le of step.ledgers.lifecycleEvents) {
      if (le.type === 'tool_call_created' && le.toolCallId) {
        lifecycleCreated.set(le.toolCallId, le.timestamp)
      }
    }
    for (const [tcId, partialTs] of firstPartial) {
      const createdTs = lifecycleCreated.get(tcId)
      if (createdTs === undefined) continue // separate rule handles missing lifecycle
      const gap = createdTs - partialTs
      if (gap > 300) {
        issues.push(issue(
          'diagnostic', step.step, 'partial_to_lifecycle_gap_large',
          `tc=${tcId.slice(0, 8)}: first raw partial at t=${partialTs}, lifecycle tool_call_created at t=${createdTs} — gap ${gap}ms (>300ms threshold). UI cannot show tool card until lifecycle fires.`,
        ))
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatCheckResult(result: CheckResult, runId: string): string {
  const lines: string[] = []
  if (result.passed) {
    lines.push(`PASS  ${runId}  (${result.warningCount} warnings, ${result.diagnosticCount} diagnostics)`)
  } else {
    lines.push(`FAIL  ${runId}  (${result.errorCount} errors, ${result.warningCount} warnings, ${result.diagnosticCount} diagnostics)`)
  }

  for (const issue of result.issues) {
    const stepLabel = issue.step !== null ? `step ${issue.step}` : 'global'
    const sev = issue.severity === 'error' ? 'ERROR' : issue.severity === 'warning' ? 'WARNING' : 'DIAG'
    const seqInfo = issue.seq !== null ? ` seq=${issue.seq}` : ''
    const srcInfo = issue.source ? ` (${issue.source})` : ''
    lines.push(`  ${sev} ${stepLabel}:${seqInfo}${srcInfo} ${issue.message} [${issue.rule}]`)
  }

  return lines.join('\n')
}
