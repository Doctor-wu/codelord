import { describe, expect, it } from 'vitest'
import { checkTrace, normalizeTrace } from '../src/trace-check.js'
import type { TraceRunV2, TraceStepV2, TraceEventEntry, LifecycleTraceEvent } from '../src/trace.js'
import * as fixtures from './trace-check-fixtures.js'

function makeRun(steps: TraceStepV2[], runLE: LifecycleTraceEvent[] = []): TraceRunV2 {
  return {
    version: 2, runId: 'run-1', sessionId: 'sess-1', workspaceRoot: '/tmp', workspaceSlug: 'test', workspaceId: 'abc123', cwd: '/tmp', provider: 'test', model: 'test', systemPromptHash: 'hash', startedAt: 1000, endedAt: 2000, outcome: { type: 'success' },
    usageSummary: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }, llmCalls: 0 },
    redactionSummary: [], eventCounts: { providerStream: 0, agentEvents: 0, lifecycleEvents: 0 }, steps,
    runEvents: runLE,
  }
}

function makeStep(step: number, overrides?: Partial<TraceStepV2>): TraceStepV2 {
  return { step, turnId: `a${step}`, startedAt: 1000 + step * 100, endedAt: 1000 + step * 100 + 50, events: [], ...overrides }
}

const LE = (seq: number, type: string, extra: Record<string, unknown> = {}) => ({
  eventId: seq, seq, type, timestamp: 1100 + seq, step: 1, turnId: 'a1', source: 'lifecycle_event' as const,
  toolCallId: null, toolName: null, phase: null, reason: null, question: null, usageSnapshot: null, count: null, messageCount: null,
  interruptSource: null, requestedAt: null, observedAt: null, latencyMs: null,
  ...extra,
})

const AE = (seq: number, type: string, extra: Record<string, unknown> = {}) => ({
  eventId: seq, seq, type, timestamp: 1100 + seq, step: 1, turnId: 'a1', source: 'agent_event' as const,
  contentIndex: null, toolCallId: null, toolName: null, deltaPreview: null, riskLevel: null, allowed: null, isError: null, resultPreview: null, ...extra,
})

const PE = (seq: number, type: string, extra: Record<string, unknown> = {}) => ({
  eventId: seq, seq, type, timestamp: 1100 + seq, step: 1, turnId: 'a1', source: 'provider_stream' as const,
  contentIndex: null, toolCallId: null, toolName: null, deltaPreview: null, contentPreview: null, argsPreview: null, stopReason: null, ...extra,
})

describe('normalizeTrace', () => {
  it('backfills missing seq for old traces', () => {
    const step = makeStep(1)
    step.events.push(
      { eventId: 1, seq: undefined as any, type: 'a', timestamp: 1100, step: 1, turnId: 'a1', source: 'lifecycle_event', toolCallId: null, toolName: null, phase: null, reason: null, question: null, usageSnapshot: null, count: null, messageCount: null, interruptSource: null, requestedAt: null, observedAt: null, latencyMs: null },
      { eventId: 2, seq: undefined as any, type: 'b', timestamp: 1110, step: 1, turnId: 'a1', source: 'lifecycle_event', toolCallId: null, toolName: null, phase: null, reason: null, question: null, usageSnapshot: null, count: null, messageCount: null, interruptSource: null, requestedAt: null, observedAt: null, latencyMs: null },
    )
    const normalized = normalizeTrace(makeRun([step]))
    const leEvents = normalized.steps[0].events.filter(e => e.source === 'lifecycle_event')
    const seqs = leEvents.map(e => e.seq)
    expect(seqs.every(s => typeof s === 'number' && s > 0)).toBe(true)
  })

  it('preserves existing seq values', () => {
    const step = makeStep(1)
    step.events.push(LE(10, 'a'), LE(20, 'b'))
    const normalized = normalizeTrace(makeRun([step]))
    const leEvents = normalized.steps[0].events.filter(e => e.source === 'lifecycle_event')
    expect(leEvents.map(e => e.seq)).toEqual([10, 20])
  })
})

describe('checkTrace', () => {
  it('passes a clean trace', () => {
    const step = makeStep(1)
    step.events.push(LE(1, 'assistant_turn_start'), LE(2, 'assistant_turn_end'))
    expect(checkTrace(makeRun([step])).passed).toBe(true)
  })

  // --- run_global_seq_monotonic: run-wide ---

  it('detects non-monotonic seq across layers', () => {
    const step = makeStep(1)
    // seq 5 in provider, then seq 5 in agent — when merged and sorted, duplicate seq=5
    step.events.push(PE(5, 'text_start'))
    step.events.push(AE(5, 'text_start')) // duplicate seq=5
    step.events.push(LE(10, 'assistant_turn_end'))
    const result = checkTrace(makeRun([step]))
    expect(result.issues.some(i => i.rule === 'run_global_seq_monotonic')).toBe(true)
  })

  // --- tool_call lifecycle ---

  it('detects tool_call_completed without created', () => {
    const step = makeStep(1)
    step.events.push(LE(1, 'tool_call_completed', { toolCallId: 'tc-1', toolName: 'bash', phase: 'completed' }))
    expect(checkTrace(makeRun([step])).issues.some(i => i.rule === 'tc_completed_without_created')).toBe(true)
  })

  it('detects tool_call_completed before created', () => {
    const step = makeStep(1)
    step.events.push(
      LE(10, 'tool_call_completed', { toolCallId: 'tc-1', phase: 'completed' }),
      LE(20, 'tool_call_created', { toolCallId: 'tc-1', phase: 'generating' }),
    )
    expect(checkTrace(makeRun([step])).issues.some(i => i.rule === 'tc_completed_before_created')).toBe(true)
  })

  it('detects duplicate tool_call_completed', () => {
    const step = makeStep(1)
    step.events.push(
      LE(1, 'tool_call_created', { toolCallId: 'tc-1' }),
      LE(2, 'tool_call_completed', { toolCallId: 'tc-1' }),
      LE(3, 'tool_call_completed', { toolCallId: 'tc-1' }),
    )
    expect(checkTrace(makeRun([step])).issues.some(i => i.rule === 'tc_duplicate_completed')).toBe(true)
  })

  // --- provider→agent correlation ---

  it('warns on provider→agent toolcall_end mismatch', () => {
    const step = makeStep(1)
    step.events.push(PE(1, 'toolcall_end', { toolCallId: 'tc-orphan', toolName: 'bash' }))
    expect(checkTrace(makeRun([step])).issues.some(i => i.rule === 'provider_agent_tc_mismatch')).toBe(true)
  })

  // --- agent→lifecycle correlation ---

  it('warns on agent toolcall_end without lifecycle tool_call_created', () => {
    const step = makeStep(1)
    step.events.push(AE(1, 'toolcall_end', { toolCallId: 'tc-orphan', toolName: 'bash' }))
    expect(checkTrace(makeRun([step])).issues.some(i => i.rule === 'agent_lifecycle_tc_mismatch')).toBe(true)
  })

  // --- tool_exec chain with toolCallId ---

  it('tool_exec_no_result uses toolCallId, not just toolName', () => {
    const step = makeStep(1)
    // Two bash calls: one has result, one doesn't
    step.events.push(
      AE(1, 'tool_exec_start', { toolCallId: 'tc-a', toolName: 'bash' }),
      AE(2, 'tool_result', { toolCallId: 'tc-a', toolName: 'bash' }),
      AE(3, 'tool_exec_start', { toolCallId: 'tc-b', toolName: 'bash' }),
      // no result for tc-b
    )
    const result = checkTrace(makeRun([step]))
    const issue = result.issues.find(i => i.rule === 'tool_exec_no_result')
    expect(issue).toBeDefined()
    expect(issue!.message).toContain('tc-b')
  })

  // --- question_answered chain ---

  it('warns on question_answered without prior waiting_user', () => {
    const step = makeStep(1)
    step.events.push(LE(1, 'question_answered', { question: 'Which?' }))
    expect(checkTrace(makeRun([step])).issues.some(i => i.rule === 'question_answered_no_waiting')).toBe(true)
  })

  it('passes when question_answered has prior waiting_user', () => {
    const step = makeStep(1)
    step.events.push(
      LE(1, 'blocked_enter', { reason: 'waiting_user' }),
      LE(2, 'question_answered', { question: 'Which?' }),
    )
    expect(checkTrace(makeRun([step])).issues.some(i => i.rule === 'question_answered_no_waiting')).toBe(false)
  })

  // --- session_done timing ---

  it('warns when session_done is before step endedAt', () => {
    const step = makeStep(1, { startedAt: 1100, endedAt: 1200 })
    step.events.push(LE(1, 'session_done', { timestamp: 1150 } as any))
    const result = checkTrace(makeRun([step]))
    expect(result.issues.some(i => i.rule === 'session_done_before_step_end')).toBe(true)
  })

  // --- old trace compat ---

  it('old trace without seq does not crash checker', () => {
    const step = makeStep(1)
    step.events.push(
      { eventId: 1, seq: undefined as any, type: 'assistant_turn_start', timestamp: 1100, step: 1, turnId: 'a1', source: 'lifecycle_event', toolCallId: null, toolName: null, phase: null, reason: null, question: null, usageSnapshot: null, count: null, messageCount: null, interruptSource: null, requestedAt: null, observedAt: null, latencyMs: null },
    )
    // Should not throw
    const result = checkTrace(makeRun([step]))
    expect(result).toBeDefined()
  })

  // --- run-level lifecycle events ---

  it('session_done in run-level ledger is checked against last step endedAt', () => {
    const step = makeStep(1, { startedAt: 1100, endedAt: 1200 })
    step.events.push(LE(1, 'assistant_turn_start'), LE(2, 'assistant_turn_end'))
    const runLE = [LE(3, 'session_done')]
    runLE[0].timestamp = 1150 // before step endedAt=1200
    runLE[0].step = 0 as any
    const result = checkTrace(makeRun([step], runLE))
    expect(result.issues.some(i => i.rule === 'session_done_before_step_end')).toBe(true)
  })

  it('question_answered in run-level without waiting_user reports issue', () => {
    const runLE = [LE(1, 'question_answered', { question: 'Which?' })]
    runLE[0].step = 0 as any
    const result = checkTrace(makeRun([], runLE))
    expect(result.issues.some(i => i.rule === 'question_answered_no_waiting')).toBe(true)
  })

  it('queue_drained count mismatch reports issue', () => {
    const step = makeStep(1)
    step.events.push(LE(1, 'queue_drained', { count: 3, messageCount: 2 }))
    const result = checkTrace(makeRun([step]))
    expect(result.issues.some(i => i.rule === 'queue_drained_count_mismatch')).toBe(true)
  })

  it('queue_drained count match passes', () => {
    const step = makeStep(1)
    step.events.push(LE(1, 'queue_drained', { count: 2, messageCount: 2 }))
    const result = checkTrace(makeRun([step]))
    expect(result.issues.some(i => i.rule === 'queue_drained_count_mismatch')).toBe(false)
  })

  it('queue_drained in run-level with count mismatch reports issue', () => {
    const runLE = [LE(1, 'queue_drained', { count: 5, messageCount: 3 })]
    runLE[0].step = 0 as any
    const result = checkTrace(makeRun([], runLE))
    expect(result.issues.some(i => i.rule === 'queue_drained_count_mismatch')).toBe(true)
  })

  it('old trace without runEvents does not crash', () => {
    const step = makeStep(1)
    step.events.push(LE(1, 'assistant_turn_start'))
    const trace = makeRun([step])
    delete (trace as any).runEvents
    const result = checkTrace(trace)
    expect(result).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Synthetic fixture regression suite
// ---------------------------------------------------------------------------

describe('checkTrace — synthetic fixture regression suite', () => {
  it('clean run passes all checks', () => {
    const result = checkTrace(fixtures.cleanRun())
    expect(result.passed).toBe(true)
    expect(result.errorCount).toBe(0)
  })

  it('clean interrupted run passes all checks', () => {
    const result = checkTrace(fixtures.cleanInterruptedRun())
    expect(result.passed).toBe(true)
    expect(result.errorCount).toBe(0)
  })

  it('interrupt_requested without observed triggers warning', () => {
    const result = checkTrace(fixtures.interruptRequestedWithoutObserved())
    expect(result.issues.some(i => i.rule === 'interrupt_requested_without_observed')).toBe(true)
  })

  it('interrupt_observed without request triggers error', () => {
    const result = checkTrace(fixtures.interruptObservedWithoutRequest())
    expect(result.issues.some(i => i.rule === 'interrupt_observed_without_request')).toBe(true)
    expect(result.passed).toBe(false)
  })

  it('interrupt request after observed triggers error', () => {
    const result = checkTrace(fixtures.interruptRequestAfterObserved())
    expect(result.issues.some(i => i.rule === 'interrupt_observed_without_request')).toBe(true)
  })

  it('interrupt observed without blocked_enter triggers warning', () => {
    const result = checkTrace(fixtures.interruptObservedWithoutBlocked())
    expect(result.issues.some(i => i.rule === 'interrupt_chain_missing_blocked_enter')).toBe(true)
  })

  it('run-level seq disorder triggers error', () => {
    const result = checkTrace(fixtures.runLevelSeqDisorder())
    expect(result.issues.some(i => i.rule === 'run_global_seq_monotonic')).toBe(true)
    expect(result.passed).toBe(false)
  })

  it('run-level time reversal triggers warning', () => {
    const result = checkTrace(fixtures.runLevelTimeReversal())
    expect(result.issues.some(i => i.rule === 'run_global_time_order')).toBe(true)
  })

  it('session_done too early triggers warning', () => {
    const result = checkTrace(fixtures.sessionDoneTooEarly())
    expect(result.issues.some(i => i.rule === 'session_done_before_step_end')).toBe(true)
  })

  it('question_answered without waiting_user triggers warning', () => {
    const result = checkTrace(fixtures.questionAnsweredWithoutWaiting())
    expect(result.issues.some(i => i.rule === 'question_answered_no_waiting')).toBe(true)
  })

  it('queue_drained count mismatch triggers error', () => {
    const result = checkTrace(fixtures.queueDrainedCountMismatch())
    expect(result.issues.some(i => i.rule === 'queue_drained_count_mismatch')).toBe(true)
    expect(result.passed).toBe(false)
  })

  it('tool chain mismatch triggers warning', () => {
    const result = checkTrace(fixtures.toolChainMismatch())
    expect(result.issues.some(i => i.rule === 'provider_agent_tc_mismatch')).toBe(true)
  })

  it('cross-step seq disorder triggers error', () => {
    const result = checkTrace(fixtures.crossStepSeqDisorder())
    expect(result.issues.some(i => i.rule === 'run_global_seq_monotonic')).toBe(true)
    expect(result.passed).toBe(false)
  })

  it('CheckIssue includes seq and source for run_global_seq_monotonic', () => {
    const result = checkTrace(fixtures.runLevelSeqDisorder())
    const seqIssue = result.issues.find(i => i.rule === 'run_global_seq_monotonic')
    expect(seqIssue).toBeDefined()
    expect(seqIssue!.seq).not.toBeNull()
    expect(seqIssue!.source).not.toBeNull()
  })

  it('CheckIssue includes seq and source for interrupt rules', () => {
    const result = checkTrace(fixtures.interruptObservedWithoutRequest())
    const intIssue = result.issues.find(i => i.rule === 'interrupt_observed_without_request')
    expect(intIssue).toBeDefined()
    expect(intIssue!.seq).not.toBeNull()
    expect(intIssue!.source).toBe('lifecycle_event')
  })
})

// ---------------------------------------------------------------------------
// Streaming diagnostics suite
// ---------------------------------------------------------------------------

describe('checkTrace — streaming diagnostics', () => {
  it('reasoningStreamPresent does NOT trigger thinking_absent', () => {
    const result = checkTrace(fixtures.reasoningStreamPresent())
    expect(result.issues.some(i => i.rule === 'thinking_absent')).toBe(false)
  })

  it('reasoningStreamPresent passes all checks (no errors)', () => {
    const result = checkTrace(fixtures.reasoningStreamPresent())
    expect(result.passed).toBe(true)
    expect(result.errorCount).toBe(0)
  })

  it('noThoughtHighDensityToolcallDelta triggers thinking_absent', () => {
    const result = checkTrace(fixtures.noThoughtHighDensityToolcallDelta())
    const diag = result.issues.find(i => i.rule === 'thinking_absent')
    expect(diag).toBeDefined()
    expect(diag!.severity).toBe('diagnostic')
  })

  it('noThoughtHighDensityToolcallDelta triggers toolcall_delta_density_high', () => {
    const result = checkTrace(fixtures.noThoughtHighDensityToolcallDelta())
    const diag = result.issues.find(i => i.rule === 'toolcall_delta_density_high')
    expect(diag).toBeDefined()
    expect(diag!.severity).toBe('diagnostic')
    expect(diag!.message).toContain('Hz')
  })

  it('noThoughtHighDensityToolcallDelta triggers partial_to_lifecycle_gap_large', () => {
    const result = checkTrace(fixtures.noThoughtHighDensityToolcallDelta())
    const diag = result.issues.find(i => i.rule === 'partial_to_lifecycle_gap_large')
    expect(diag).toBeDefined()
    expect(diag!.severity).toBe('diagnostic')
    expect(diag!.message).toContain('gap')
  })

  it('diagnostics do not affect passed status', () => {
    const result = checkTrace(fixtures.noThoughtHighDensityToolcallDelta())
    // diagnostics are informational — should not cause failure
    expect(result.passed).toBe(true)
    expect(result.diagnosticCount).toBeGreaterThan(0)
  })

  it('cleanRun triggers thinking_absent (no thinking events in clean run)', () => {
    const result = checkTrace(fixtures.cleanRun())
    // cleanRun has text_start/delta/end but no thinking_* — should trigger
    expect(result.issues.some(i => i.rule === 'thinking_absent')).toBe(true)
  })

  it('cleanRun does NOT trigger toolcall_delta_density_high', () => {
    const result = checkTrace(fixtures.cleanRun())
    expect(result.issues.some(i => i.rule === 'toolcall_delta_density_high')).toBe(false)
  })
})
