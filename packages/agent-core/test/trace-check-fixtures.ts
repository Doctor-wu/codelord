// ---------------------------------------------------------------------------
// Synthetic trace fixtures for auditor regression testing
// ---------------------------------------------------------------------------

import type { TraceRunV2, TraceStepV2, LifecycleTraceEvent, ProviderStreamTraceEvent, AgentTraceEvent } from '../src/trace.js'

// ---------------------------------------------------------------------------
// Base builders
// ---------------------------------------------------------------------------

let _seq = 0
function resetSeq() { _seq = 0 }
function nextSeq() { return ++_seq }

const BASE_TIME = 1000

function makeRun(steps: TraceStepV2[], runLE: LifecycleTraceEvent[] = [], overrides: Partial<TraceRunV2> = {}): TraceRunV2 {
  return {
    version: 2, runId: 'run-fixture', sessionId: 'sess-1', workspaceRoot: '/tmp', workspaceSlug: 'test', workspaceId: 'abc123', cwd: '/tmp', provider: 'test', model: 'test', systemPromptHash: 'hash', startedAt: BASE_TIME, endedAt: BASE_TIME + 5000, outcome: { type: 'success' },
    usageSummary: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }, llmCalls: 0 },
    redactionSummary: [], eventCounts: { providerStream: 0, agentEvents: 0, lifecycleEvents: 0 }, steps,
    runLifecycleEvents: runLE,
    ...overrides,
  }
}

function makeStep(step: number, overrides?: Partial<TraceStepV2>): TraceStepV2 {
  return { step, turnId: `a${step}`, startedAt: BASE_TIME + step * 100, endedAt: BASE_TIME + step * 100 + 50, ledgers: { providerStream: [], agentEvents: [], lifecycleEvents: [] }, ...overrides }
}

function LE(seq: number, type: string, extra: Partial<LifecycleTraceEvent> = {}): LifecycleTraceEvent {
  return {
    eventId: seq, seq, type, timestamp: BASE_TIME + seq * 10, step: 1, turnId: 'a1', source: 'lifecycle_event',
    toolCallId: null, toolName: null, phase: null, reason: null, question: null, usageSnapshot: null, count: null, messageCount: null,
    interruptSource: null, requestedAt: null, observedAt: null, latencyMs: null,
    ...extra,
  }
}

function AE(seq: number, type: string, extra: Partial<AgentTraceEvent> = {}): AgentTraceEvent {
  return {
    eventId: seq, seq, type, timestamp: BASE_TIME + seq * 10, step: 1, turnId: 'a1', source: 'agent_event',
    contentIndex: null, toolCallId: null, toolName: null, deltaPreview: null, riskLevel: null, allowed: null, isError: null, resultPreview: null,
    ...extra,
  }
}

function PE(seq: number, type: string, extra: Partial<ProviderStreamTraceEvent> = {}): ProviderStreamTraceEvent {
  return {
    eventId: seq, seq, type, timestamp: BASE_TIME + seq * 10, step: 1, turnId: 'a1', source: 'provider_stream',
    contentIndex: null, toolCallId: null, toolName: null, deltaPreview: null, contentPreview: null, argsPreview: null, stopReason: null,
    ...extra,
  }
}

// ---------------------------------------------------------------------------
// Fixture: clean run (should pass all checks)
// ---------------------------------------------------------------------------

export function cleanRun(): TraceRunV2 {
  resetSeq()
  const step = makeStep(1)
  step.ledgers.providerStream.push(PE(nextSeq(), 'text_start'), PE(nextSeq(), 'text_delta'), PE(nextSeq(), 'text_end'), PE(nextSeq(), 'done', { stopReason: 'stop' }))
  step.ledgers.agentEvents.push(AE(nextSeq(), 'text_delta'), AE(nextSeq(), 'text_end'))
  step.ledgers.lifecycleEvents.push(LE(nextSeq(), 'assistant_turn_start'), LE(nextSeq(), 'usage_updated'), LE(nextSeq(), 'assistant_turn_end'))
  const runLE = [LE(nextSeq(), 'session_done', { step: 0 as any, timestamp: BASE_TIME + 5000 })]
  return makeRun([step], runLE)
}

// ---------------------------------------------------------------------------
// Fixture: clean interrupted run (should pass all checks)
// ---------------------------------------------------------------------------

export function cleanInterruptedRun(): TraceRunV2 {
  resetSeq()
  const step = makeStep(1)
  step.ledgers.providerStream.push(PE(nextSeq(), 'text_start'), PE(nextSeq(), 'text_delta'))
  step.ledgers.agentEvents.push(AE(nextSeq(), 'text_delta'))
  step.ledgers.lifecycleEvents.push(
    LE(nextSeq(), 'assistant_turn_start'),
    LE(nextSeq(), 'interrupt_requested', { interruptSource: 'sigint' }),
    LE(nextSeq(), 'interrupt_observed', { interruptSource: 'sigint', requestedAt: BASE_TIME + 50, observedAt: BASE_TIME + 60, latencyMs: 10 }),
    LE(nextSeq(), 'blocked_enter', { reason: 'interrupted' }),
    LE(nextSeq(), 'assistant_turn_end'),
  )
  return makeRun([step], [], { outcome: { type: 'blocked', reason: 'interrupted' } })
}

// ---------------------------------------------------------------------------
// Fixture: interrupt requested but never observed
// ---------------------------------------------------------------------------

export function interruptRequestedWithoutObserved(): TraceRunV2 {
  resetSeq()
  const step = makeStep(1)
  step.ledgers.lifecycleEvents.push(
    LE(nextSeq(), 'assistant_turn_start'),
    LE(nextSeq(), 'interrupt_requested', { interruptSource: 'sigint' }),
    LE(nextSeq(), 'assistant_turn_end'),
  )
  return makeRun([step])
}

// ---------------------------------------------------------------------------
// Fixture: interrupt observed without request
// ---------------------------------------------------------------------------

export function interruptObservedWithoutRequest(): TraceRunV2 {
  resetSeq()
  const step = makeStep(1)
  step.ledgers.lifecycleEvents.push(
    LE(nextSeq(), 'assistant_turn_start'),
    LE(nextSeq(), 'interrupt_observed', { interruptSource: 'sigint', requestedAt: BASE_TIME + 50, observedAt: BASE_TIME + 60, latencyMs: 10 }),
    LE(nextSeq(), 'blocked_enter', { reason: 'interrupted' }),
    LE(nextSeq(), 'assistant_turn_end'),
  )
  return makeRun([step])
}

// ---------------------------------------------------------------------------
// Fixture: run-level seq disorder
// ---------------------------------------------------------------------------

export function runLevelSeqDisorder(): TraceRunV2 {
  resetSeq()
  const step = makeStep(1)
  step.ledgers.lifecycleEvents.push(LE(10, 'assistant_turn_start'), LE(20, 'assistant_turn_end'))
  // Run-level event with seq=20 — duplicate of step event, creating non-monotonic when merged
  const runLE = [LE(20, 'session_done', { step: 0 as any, timestamp: BASE_TIME + 5000 })]
  return makeRun([step], runLE)
}

// ---------------------------------------------------------------------------
// Fixture: run-level time reversal
// ---------------------------------------------------------------------------

export function runLevelTimeReversal(): TraceRunV2 {
  resetSeq()
  const step = makeStep(1)
  step.ledgers.lifecycleEvents.push(
    LE(1, 'assistant_turn_start', { timestamp: BASE_TIME + 500 }),
    LE(2, 'assistant_turn_end', { timestamp: BASE_TIME + 600 }),
  )
  const runLE = [LE(3, 'session_done', { step: 0 as any, timestamp: BASE_TIME + 100 })]
  return makeRun([step], runLE)
}

// ---------------------------------------------------------------------------
// Fixture: session_done too early
// ---------------------------------------------------------------------------

export function sessionDoneTooEarly(): TraceRunV2 {
  resetSeq()
  const step = makeStep(1, { startedAt: BASE_TIME + 100, endedAt: BASE_TIME + 500 })
  step.ledgers.lifecycleEvents.push(LE(nextSeq(), 'assistant_turn_start'), LE(nextSeq(), 'assistant_turn_end'))
  const runLE = [LE(nextSeq(), 'session_done', { step: 0 as any, timestamp: BASE_TIME + 200 })]
  return makeRun([step], runLE)
}

// ---------------------------------------------------------------------------
// Fixture: question_answered without waiting_user
// ---------------------------------------------------------------------------

export function questionAnsweredWithoutWaiting(): TraceRunV2 {
  resetSeq()
  const step = makeStep(1)
  step.ledgers.lifecycleEvents.push(
    LE(nextSeq(), 'assistant_turn_start'),
    LE(nextSeq(), 'question_answered', { question: 'Which DB?' }),
    LE(nextSeq(), 'assistant_turn_end'),
  )
  return makeRun([step])
}

// ---------------------------------------------------------------------------
// Fixture: queue_drained count mismatch
// ---------------------------------------------------------------------------

export function queueDrainedCountMismatch(): TraceRunV2 {
  resetSeq()
  const step = makeStep(1)
  step.ledgers.lifecycleEvents.push(
    LE(nextSeq(), 'assistant_turn_start'),
    LE(nextSeq(), 'queue_drained', { count: 5, messageCount: 3 }),
    LE(nextSeq(), 'assistant_turn_end'),
  )
  return makeRun([step])
}

// ---------------------------------------------------------------------------
// Fixture: tool chain mismatch
// ---------------------------------------------------------------------------

export function toolChainMismatch(): TraceRunV2 {
  resetSeq()
  const step = makeStep(1)
  step.ledgers.providerStream.push(PE(nextSeq(), 'toolcall_end', { toolCallId: 'tc-orphan', toolName: 'bash' }))
  step.ledgers.lifecycleEvents.push(LE(nextSeq(), 'assistant_turn_start'), LE(nextSeq(), 'assistant_turn_end'))
  return makeRun([step])
}

// ---------------------------------------------------------------------------
// Fixture: interrupt request after observed (order inversion)
// ---------------------------------------------------------------------------

export function interruptRequestAfterObserved(): TraceRunV2 {
  resetSeq()
  const step = makeStep(1)
  step.ledgers.lifecycleEvents.push(
    LE(nextSeq(), 'assistant_turn_start'),
    LE(nextSeq(), 'interrupt_observed', { interruptSource: 'sigint', requestedAt: BASE_TIME + 50, observedAt: BASE_TIME + 60, latencyMs: 10 }),
    LE(nextSeq(), 'interrupt_requested', { interruptSource: 'sigint' }),
    LE(nextSeq(), 'blocked_enter', { reason: 'interrupted' }),
    LE(nextSeq(), 'assistant_turn_end'),
  )
  return makeRun([step])
}

// ---------------------------------------------------------------------------
// Fixture: interrupt observed without blocked_enter
// ---------------------------------------------------------------------------

export function interruptObservedWithoutBlocked(): TraceRunV2 {
  resetSeq()
  const step = makeStep(1)
  step.ledgers.lifecycleEvents.push(
    LE(nextSeq(), 'assistant_turn_start'),
    LE(nextSeq(), 'interrupt_requested', { interruptSource: 'sigint' }),
    LE(nextSeq(), 'interrupt_observed', { interruptSource: 'sigint', requestedAt: BASE_TIME + 50, observedAt: BASE_TIME + 60, latencyMs: 10 }),
    LE(nextSeq(), 'assistant_turn_end'),
  )
  return makeRun([step])
}

// ---------------------------------------------------------------------------
// Fixture: multi-step run with cross-step seq disorder
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fixture: reasoning stream present (thinking_start/delta/end + tool call)
// ---------------------------------------------------------------------------

export function reasoningStreamPresent(): TraceRunV2 {
  resetSeq()
  const step = makeStep(1)
  // Stable thinking stream
  step.ledgers.providerStream.push(
    PE(nextSeq(), 'thinking_start'),
    PE(nextSeq(), 'thinking_delta', { deltaPreview: 'Let me analyze...' }),
    PE(nextSeq(), 'thinking_delta', { deltaPreview: 'I should read the file first.' }),
    PE(nextSeq(), 'thinking_end'),
    // Then a tool call
    PE(nextSeq(), 'toolcall_start', { toolCallId: 'tc-1', toolName: 'read_file' }),
    PE(nextSeq(), 'toolcall_delta', { toolCallId: 'tc-1', argsPreview: '{"path":"/src' }),
    PE(nextSeq(), 'toolcall_end', { toolCallId: 'tc-1', toolName: 'read_file' }),
    PE(nextSeq(), 'done', { stopReason: 'tool_use' }),
  )
  step.ledgers.agentEvents.push(
    AE(nextSeq(), 'toolcall_end', { toolCallId: 'tc-1', toolName: 'read_file' }),
  )
  step.ledgers.lifecycleEvents.push(
    LE(nextSeq(), 'assistant_turn_start'),
    LE(nextSeq(), 'tool_call_created', { toolCallId: 'tc-1', toolName: 'read_file', phase: 'generating' }),
    LE(nextSeq(), 'tool_call_completed', { toolCallId: 'tc-1', toolName: 'read_file', phase: 'completed' }),
    LE(nextSeq(), 'assistant_turn_end'),
  )
  return makeRun([step])
}

// ---------------------------------------------------------------------------
// Fixture: no thought + high density toolcall_delta
// ---------------------------------------------------------------------------

export function noThoughtHighDensityToolcallDelta(): TraceRunV2 {
  resetSeq()
  const step = makeStep(1)
  // No thinking_* events at all.
  // toolcall_start at t=BASE_TIME+10, then 40 rapid toolcall_delta in 200ms
  const tcStartSeq = nextSeq()
  step.ledgers.providerStream.push(
    PE(tcStartSeq, 'toolcall_start', { toolCallId: 'tc-1', toolName: 'file_write', timestamp: BASE_TIME + 10 }),
  )
  // 40 deltas in 200ms → 5ms apart → 200 Hz
  for (let i = 0; i < 40; i++) {
    step.ledgers.providerStream.push(
      PE(nextSeq(), 'toolcall_delta', { toolCallId: 'tc-1', argsPreview: `chunk-${i}`, timestamp: BASE_TIME + 15 + i * 5 }),
    )
  }
  step.ledgers.providerStream.push(
    PE(nextSeq(), 'toolcall_end', { toolCallId: 'tc-1', toolName: 'file_write', timestamp: BASE_TIME + 250 }),
    PE(nextSeq(), 'done', { stopReason: 'tool_use', timestamp: BASE_TIME + 260 }),
  )
  step.ledgers.agentEvents.push(
    AE(nextSeq(), 'toolcall_end', { toolCallId: 'tc-1', toolName: 'file_write' }),
  )
  // lifecycle tool_call_created arrives much later than the first raw partial
  step.ledgers.lifecycleEvents.push(
    LE(nextSeq(), 'assistant_turn_start', { timestamp: BASE_TIME + 5 }),
    LE(nextSeq(), 'tool_call_created', { toolCallId: 'tc-1', toolName: 'file_write', phase: 'generating', timestamp: BASE_TIME + 800 }),
    LE(nextSeq(), 'tool_call_completed', { toolCallId: 'tc-1', toolName: 'file_write', phase: 'completed', timestamp: BASE_TIME + 900 }),
    LE(nextSeq(), 'assistant_turn_end', { timestamp: BASE_TIME + 950 }),
  )
  return makeRun([step])
}

// ---------------------------------------------------------------------------
// Fixture: multi-step run with cross-step seq disorder
// ---------------------------------------------------------------------------

export function crossStepSeqDisorder(): TraceRunV2 {
  const step1 = makeStep(1)
  step1.ledgers.lifecycleEvents.push(LE(10, 'assistant_turn_start'), LE(20, 'assistant_turn_end'))
  const step2 = makeStep(2, { startedAt: BASE_TIME + 300, endedAt: BASE_TIME + 400 })
  // Step 2 reuses seq=20 from step 1 — duplicate seq across steps
  step2.ledgers.lifecycleEvents.push(
    LE(20, 'assistant_turn_start', { step: 2, turnId: 'a2' }),
    LE(25, 'assistant_turn_end', { step: 2, turnId: 'a2' }),
  )
  return makeRun([step1, step2])
}
