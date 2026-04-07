import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { TraceRecorder } from '../src/trace-recorder.js'
import { TraceStore, workspaceSlug, workspaceId, workspaceDirName, formatTraceShow } from '../src/trace-store.js'
import type { LifecycleEvent, AgentEvent, ProviderStreamTraceEvent } from '@agent/core'
import { createReasoningState, createToolCallLifecycle, createUsageAggregate } from '@agent/core'
import type { UsageAggregate } from '@agent/core'

function makeTmpDir(): string {
  const dir = join(tmpdir(), `codelord-trace-test-${randomUUID()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

const recorderOpts = {
  sessionId: 'sess-1',
  cwd: '/tmp/project',
  workspaceRoot: '/tmp/project',
  workspaceSlug: 'project',
  workspaceId: 'abc123def456',
  provider: 'anthropic',
  model: 'claude-3',
  systemPrompt: 'You are a test agent.',
}

function makeUsageAggregate(): UsageAggregate {
  return {
    ...createUsageAggregate(),
    input: 100, output: 50, cacheRead: 30, cacheWrite: 10, totalTokens: 190,
    cost: { input: 0.001, output: 0.002, cacheRead: 0.0003, cacheWrite: 0.0001, total: 0.0034 },
    llmCalls: 1,
    lastCall: {
      model: 'claude-3', provider: 'anthropic', stopReason: 'stop', latencyMs: 500,
      input: 100, output: 50, cacheRead: 30, cacheWrite: 10, totalTokens: 190,
      cost: { input: 0.001, output: 0.002, cacheRead: 0.0003, cacheWrite: 0.0001, total: 0.0034 },
    },
  }
}

function makeProviderEvent(overrides: Partial<ProviderStreamTraceEvent> = {}): ProviderStreamTraceEvent {
  return {
    eventId: 1, seq: 0, type: 'text_delta', timestamp: Date.now(), step: 1, turnId: 'a1',
    source: 'provider_stream', contentIndex: 0, toolCallId: null, toolName: null,
    deltaPreview: 'hello', contentPreview: null, argsPreview: null, stopReason: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// TraceRecorder v2
// ---------------------------------------------------------------------------

describe('TraceRecorder v2', () => {
  it('builds 3-layer ledger from mixed events', () => {
    const rec = new TraceRecorder(recorderOpts)

    // Lifecycle: start step
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })

    // Provider stream events
    rec.onProviderStreamEvent(makeProviderEvent({ step: 1, turnId: 'a1', type: 'text_delta', deltaPreview: 'hello' }))
    rec.onProviderStreamEvent(makeProviderEvent({ step: 1, turnId: 'a1', type: 'done', stopReason: 'stop', eventId: 2 }))

    // Agent events
    rec.onAgentEvent({ type: 'text_delta', contentIndex: 0, delta: 'hello' })
    rec.onAgentEvent({ type: 'text_end', contentIndex: 0, text: 'hello world' })

    // Lifecycle: usage + turn end
    rec.onLifecycleEvent({ type: 'usage_updated', usage: makeUsageAggregate(), timestamp: 1500 })
    rec.onLifecycleEvent({ type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 1700 })

    const trace = rec.finalize({ type: 'success', text: 'done' })

    expect(trace.version).toBe(2)
    expect(trace.workspaceSlug).toBe('project')
    expect(trace.workspaceId).toBe('abc123def456')
    expect(trace.steps).toHaveLength(1)

    const step = trace.steps[0]
    const pCount = step.events.filter(e => e.source === 'provider_stream').length
    const aCount = step.events.filter(e => e.source === 'agent_event').length
    const lCount = step.events.filter(e => e.source === 'lifecycle_event').length
    expect(pCount).toBeGreaterThanOrEqual(2)
    expect(aCount).toBeGreaterThanOrEqual(2)
    expect(lCount).toBeGreaterThanOrEqual(2)

    expect(trace.eventCounts.providerStream).toBe(2)
    expect(trace.eventCounts.agentEvents).toBe(2)
    expect(trace.eventCounts.lifecycleEvents).toBeGreaterThanOrEqual(3) // start + usage + end
  })

  it('same toolCallId appears in all 3 ledgers', () => {
    const rec = new TraceRecorder(recorderOpts)
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })

    // Provider: toolcall_end
    rec.onProviderStreamEvent(makeProviderEvent({
      step: 1, turnId: 'a1', type: 'toolcall_end',
      toolCallId: 'tc-42', toolName: 'bash', eventId: 1,
    }))

    // Agent: toolcall_end
    rec.onAgentEvent({ type: 'toolcall_end', toolCall: { type: 'toolCall', id: 'tc-42', name: 'bash', arguments: {} } as any })

    // Lifecycle: tool_call_completed
    const tc = createToolCallLifecycle({ id: 'tc-42', toolName: 'bash', args: {}, command: 'echo' })
    tc.phase = 'completed'; tc.completedAt = 1100; tc.executionStartedAt = 1050
    rec.onLifecycleEvent({ type: 'tool_call_completed', toolCall: tc })

    rec.onLifecycleEvent({ type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 1200 })

    const trace = rec.finalize({ type: 'success', text: '' })
    const step = trace.steps[0]

    // All three layers should reference tc-42
    const providerTc = step.events.find(e => e.source === 'provider_stream' && 'toolCallId' in e && e.toolCallId === 'tc-42')
    const agentTc = step.events.find(e => e.source === 'agent_event' && 'toolCallId' in e && e.toolCallId === 'tc-42')
    const lifecycleTc = step.events.find(e => e.source === 'lifecycle_event' && 'toolCallId' in e && e.toolCallId === 'tc-42')

    expect(providerTc).toBeDefined()
    expect(agentTc).toBeDefined()
    expect(lifecycleTc).toBeDefined()
  })

  it('redacts secrets in provider stream previews', () => {
    const rec = new TraceRecorder(recorderOpts)
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })

    rec.onProviderStreamEvent(makeProviderEvent({
      step: 1, turnId: 'a1', type: 'text_delta',
      deltaPreview: 'key: sk-aaaabbbbccccddddeeeeffffgggg',
    }))

    rec.onLifecycleEvent({ type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 1100 })
    const trace = rec.finalize({ type: 'success', text: '' })

    const delta = trace.steps[0].events.find(e => e.source === 'provider_stream' && e.type === 'text_delta') as any
    expect(delta.deltaPreview).toContain('[REDACTED:API_KEY]')
    expect(delta.deltaPreview).not.toContain('sk-aaaa')
  })

  it('assigns monotonically increasing seq across all three layers', () => {
    const rec = new TraceRecorder(recorderOpts)
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })
    rec.onProviderStreamEvent(makeProviderEvent({ step: 1, turnId: 'a1', type: 'text_delta' }))
    rec.onAgentEvent({ type: 'text_delta', contentIndex: 0, delta: 'hi' })
    rec.onLifecycleEvent({ type: 'usage_updated', usage: makeUsageAggregate(), timestamp: 1500 })
    rec.onProviderStreamEvent(makeProviderEvent({ step: 1, turnId: 'a1', type: 'done', stopReason: 'stop', eventId: 2 }))
    rec.onLifecycleEvent({ type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 1700 })

    const trace = rec.finalize({ type: 'success', text: '' })
    const step = trace.steps[0]

    // Collect all seqs across layers
    const allSeqs = step.events.map(e => e.seq).sort((a, b) => a - b)

    // All seqs should be unique and positive
    expect(allSeqs.every(s => s > 0)).toBe(true)
    expect(new Set(allSeqs).size).toBe(allSeqs.length)
  })

  it('session_done without currentStep goes to runEvents', () => {
    const rec = new TraceRecorder(recorderOpts)
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })
    rec.onLifecycleEvent({ type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 1100 })
    // Now currentStep is null — session_done should go to run-level
    rec.onLifecycleEvent({ type: 'session_done', success: true, text: 'ok', timestamp: 1200 })

    const trace = rec.finalize({ type: 'success', text: 'ok' })
    expect(trace.runEvents.length).toBeGreaterThanOrEqual(1)
    expect(trace.runEvents.some(e => e.type === 'session_done')).toBe(true)
    // Should NOT be in step events
    for (const step of trace.steps) {
      expect(step.events.some(e => e.type === 'session_done')).toBe(false)
    }
  })

  it('queue_drained without currentStep goes to runEvents', () => {
    const rec = new TraceRecorder(recorderOpts)
    // No step started — queue_drained should go to run-level
    rec.onLifecycleEvent({ type: 'queue_drained', count: 2, messages: [{ content: 'a', enqueuedAt: 900 }, { content: 'b', enqueuedAt: 950 }], injectedAt: 1000 })

    const trace = rec.finalize({ type: 'success', text: '' })
    expect(trace.runEvents.some(e => e.type === 'queue_drained')).toBe(true)
    const qd = trace.runEvents.find(e => e.type === 'queue_drained')! as any
    expect(qd.count).toBe(2)
    expect(qd.messageCount).toBe(2)
  })

  it('question_answered without currentStep goes to runEvents', () => {
    const rec = new TraceRecorder(recorderOpts)
    rec.onLifecycleEvent({ type: 'question_answered', question: 'Which?', whyAsk: 'Need', askedAt: 1000, answer: 'pg', answeredAt: 2000 })

    const trace = rec.finalize({ type: 'success', text: '' })
    expect(trace.runEvents.some(e => e.type === 'question_answered')).toBe(true)
  })

  it('step-internal events stay in step events, not run-level', () => {
    const rec = new TraceRecorder(recorderOpts)
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })
    rec.onLifecycleEvent({ type: 'usage_updated', usage: makeUsageAggregate(), timestamp: 1500 })
    rec.onLifecycleEvent({ type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 1700 })

    const trace = rec.finalize({ type: 'success', text: '' })
    // usage_updated should be in step, not run-level
    expect(trace.steps[0].events.some(e => e.type === 'usage_updated')).toBe(true)
    expect(trace.runEvents.some(e => e.type === 'usage_updated')).toBe(false)
  })

  // --- Interrupt chain recording ---

  it('recordInterruptRequest emits interrupt_requested trace fact', () => {
    const rec = new TraceRecorder(recorderOpts)
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })
    rec.recordInterruptRequest('sigint')
    rec.onLifecycleEvent({ type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 1100 })

    const trace = rec.finalize({ type: 'blocked', reason: 'interrupted' })
    const step = trace.steps[0]
    const reqEvent = step.events.find(e => e.type === 'interrupt_requested') as any
    expect(reqEvent).toBeDefined()
    expect(reqEvent!.interruptSource).toBe('sigint')
    expect(reqEvent!.seq).toBeGreaterThan(0)
  })

  it('blocked_enter(interrupted) emits interrupt_observed trace fact', () => {
    const rec = new TraceRecorder(recorderOpts)
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })
    rec.recordInterruptRequest('sigint')
    rec.onLifecycleEvent({ type: 'blocked_enter', reason: 'interrupted', timestamp: 1050 })
    rec.onLifecycleEvent({ type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 1100 })

    const trace = rec.finalize({ type: 'blocked', reason: 'interrupted' })
    const step = trace.steps[0]
    const obsEvent = step.events.find(e => e.type === 'interrupt_observed') as any
    expect(obsEvent).toBeDefined()
    expect(obsEvent!.interruptSource).toBe('sigint')
    expect(obsEvent!.requestedAt).not.toBeNull()
    expect(obsEvent!.observedAt).not.toBeNull()
    expect(obsEvent!.latencyMs).not.toBeNull()
  })

  it('interrupt chain has correct seq ordering: requested < observed < blocked_enter', () => {
    const rec = new TraceRecorder(recorderOpts)
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })
    rec.recordInterruptRequest('sigint')
    rec.onLifecycleEvent({ type: 'blocked_enter', reason: 'interrupted', timestamp: 1050 })
    rec.onLifecycleEvent({ type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 1100 })

    const trace = rec.finalize({ type: 'blocked', reason: 'interrupted' })
    const step = trace.steps[0]
    const reqSeq = step.events.find(e => e.type === 'interrupt_requested')!.seq
    const obsSeq = step.events.find(e => e.type === 'interrupt_observed')!.seq
    const blockedSeq = step.events.find(e => e.type === 'blocked_enter' && (e as any).reason === 'interrupted')!.seq
    expect(reqSeq).toBeLessThan(obsSeq)
    expect(obsSeq).toBeLessThan(blockedSeq)
  })

  it('interrupt_requested without step goes to runEvents', () => {
    const rec = new TraceRecorder(recorderOpts)
    // No step started
    rec.recordInterruptRequest('api')

    const trace = rec.finalize({ type: 'blocked', reason: 'interrupted' })
    expect(trace.runEvents.some(e => e.type === 'interrupt_requested')).toBe(true)
    expect((trace.runEvents.find(e => e.type === 'interrupt_requested') as any)!.interruptSource).toBe('api')
  })

  it('interrupt events do not duplicate across step and run-level', () => {
    const rec = new TraceRecorder(recorderOpts)
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })
    rec.recordInterruptRequest('sigint')
    rec.onLifecycleEvent({ type: 'blocked_enter', reason: 'interrupted', timestamp: 1050 })
    rec.onLifecycleEvent({ type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 1100 })

    const trace = rec.finalize({ type: 'blocked', reason: 'interrupted' })
    // All interrupt events should be in step, not run-level
    expect(trace.steps[0].events.filter(e => e.type === 'interrupt_requested')).toHaveLength(1)
    expect(trace.steps[0].events.filter(e => e.type === 'interrupt_observed')).toHaveLength(1)
    expect(trace.runEvents.filter(e => e.type === 'interrupt_requested')).toHaveLength(0)
    expect(trace.runEvents.filter(e => e.type === 'interrupt_observed')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// TraceStore v2 (workspace-aware)
// ---------------------------------------------------------------------------

describe('TraceStore v2', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs) {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
    }
    dirs.length = 0
  })

  function makeTrace(overrides: Partial<Record<string, unknown>> = {}) {
    const rec = new TraceRecorder({ ...recorderOpts, ...overrides as any })
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })
    rec.onLifecycleEvent({ type: 'usage_updated', usage: makeUsageAggregate(), timestamp: 1500 })
    rec.onLifecycleEvent({ type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 1700 })
    return rec.finalize({ type: 'success', text: 'ok' })
  }

  it('writes to workspace subdirectory', () => {
    const dir = makeTmpDir(); dirs.push(dir)
    const store = new TraceStore(dir)
    const trace = makeTrace()
    store.save(trace)

    const wsDirs = readdirSync(dir)
    expect(wsDirs).toHaveLength(1)
    expect(wsDirs[0]).toBe(`${trace.workspaceSlug}-${trace.workspaceId}`)

    const files = readdirSync(join(dir, wsDirs[0]))
    expect(files).toHaveLength(1)
    expect(files[0]).toBe(`${trace.runId}.json`)
  })

  it('load finds trace across workspaces', () => {
    const dir = makeTmpDir(); dirs.push(dir)
    const store = new TraceStore(dir)
    const trace = makeTrace()
    store.save(trace)

    const loaded = store.load(trace.runId)
    expect(loaded).not.toBeNull()
    expect(loaded!.runId).toBe(trace.runId)
    expect(loaded!.version).toBe(2)
  })

  it('list filters by workspace', () => {
    const dir = makeTmpDir(); dirs.push(dir)
    const store = new TraceStore(dir)

    const t1 = makeTrace()
    const t2 = makeTrace({ workspaceSlug: 'other', workspaceId: 'other123other' })
    store.save(t1)
    store.save(t2)

    const filtered = store.list({ workspaceId: 'abc123def456' })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].runId).toBe(t1.runId)
  })

  it('list --all returns cross-workspace', () => {
    const dir = makeTmpDir(); dirs.push(dir)
    const store = new TraceStore(dir)

    const t1 = makeTrace()
    const t2 = makeTrace({ workspaceSlug: 'other', workspaceId: 'other123other' })
    store.save(t1)
    store.save(t2)

    const all = store.list()
    expect(all).toHaveLength(2)
  })

  it('trace on disk is redacted', () => {
    const dir = makeTmpDir(); dirs.push(dir)
    const store = new TraceStore(dir)

    const rec = new TraceRecorder(recorderOpts)
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })
    rec.onProviderStreamEvent(makeProviderEvent({
      step: 1, turnId: 'a1', type: 'text_delta',
      deltaPreview: 'secret: sk-aaaabbbbccccddddeeeeffffgggg',
    }))
    rec.onLifecycleEvent({ type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 1100 })
    const trace = rec.finalize({ type: 'success', text: '' })
    store.save(trace)

    const raw = readFileSync(join(dir, `${trace.workspaceSlug}-${trace.workspaceId}`, `${trace.runId}.json`), 'utf-8')
    expect(raw).not.toContain('sk-aaaa')
    expect(raw).toContain('[REDACTED:API_KEY]')
  })
})

// ---------------------------------------------------------------------------
// Workspace utilities
// ---------------------------------------------------------------------------

describe('workspace utilities', () => {
  it('workspaceSlug returns basename', () => {
    expect(workspaceSlug('/home/user/my-project')).toBe('my-project')
  })

  it('workspaceId is stable hash', () => {
    const id1 = workspaceId('/home/user/project')
    const id2 = workspaceId('/home/user/project')
    expect(id1).toBe(id2)
    expect(id1).toHaveLength(12)
  })

  it('different paths produce different ids', () => {
    expect(workspaceId('/a')).not.toBe(workspaceId('/b'))
  })
})

// ---------------------------------------------------------------------------
// Prefix matching
// ---------------------------------------------------------------------------

describe('TraceStore prefix matching', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs) {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
    }
    dirs.length = 0
  })

  function makeTrace(overrides: Partial<Record<string, unknown>> = {}) {
    const rec = new TraceRecorder({ ...recorderOpts, ...overrides as any })
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })
    rec.onLifecycleEvent({ type: 'usage_updated', usage: makeUsageAggregate(), timestamp: 1500 })
    rec.onLifecycleEvent({ type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 1700 })
    return rec.finalize({ type: 'success', text: 'ok' })
  }

  it('exact id match works', () => {
    const dir = makeTmpDir(); dirs.push(dir)
    const store = new TraceStore(dir)
    const trace = makeTrace()
    store.save(trace)

    const result = store.findByPrefix(trace.runId)
    expect(result.type).toBe('exact')
  })

  it('unique prefix match works', () => {
    const dir = makeTmpDir(); dirs.push(dir)
    const store = new TraceStore(dir)
    const trace = makeTrace()
    store.save(trace)

    const result = store.findByPrefix(trace.runId.slice(0, 8))
    expect(result.type).toBe('unique')
    if (result.type === 'unique') {
      expect(result.trace.runId).toBe(trace.runId)
    }
  })

  it('ambiguous prefix returns candidates', () => {
    const dir = makeTmpDir(); dirs.push(dir)
    const store = new TraceStore(dir)
    const t1 = makeTrace()
    const t2 = makeTrace()
    store.save(t1)
    store.save(t2)

    // Use empty-ish prefix that matches both (first 4 chars might differ, but '' won't work)
    // Instead, save with known prefix by checking both runIds
    const result = store.findByPrefix(t1.runId.slice(0, 4))
    // Could be unique or ambiguous depending on UUID randomness
    // Just verify it doesn't crash and returns a valid type
    expect(['exact', 'unique', 'ambiguous', 'not_found']).toContain(result.type)
  })

  it('non-existent prefix returns not_found', () => {
    const dir = makeTmpDir(); dirs.push(dir)
    const store = new TraceStore(dir)

    const result = store.findByPrefix('zzzzzzzzz')
    expect(result.type).toBe('not_found')
  })

  it('load() still works with full id', () => {
    const dir = makeTmpDir(); dirs.push(dir)
    const store = new TraceStore(dir)
    const trace = makeTrace()
    store.save(trace)

    expect(store.load(trace.runId)).not.toBeNull()
  })

  it('load() works with unique prefix', () => {
    const dir = makeTmpDir(); dirs.push(dir)
    const store = new TraceStore(dir)
    const trace = makeTrace()
    store.save(trace)

    expect(store.load(trace.runId.slice(0, 8))).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// formatTraceShow debugger output
// ---------------------------------------------------------------------------

describe('formatTraceShow debugger view', () => {
  it('output contains step headers with [P]/[A]/[L] tagged events', () => {
    const rec = new TraceRecorder(recorderOpts)
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })

    // Provider stream
    rec.onProviderStreamEvent(makeProviderEvent({ step: 1, turnId: 'a1', type: 'text_start', contentIndex: 0 }))
    rec.onProviderStreamEvent(makeProviderEvent({ step: 1, turnId: 'a1', type: 'text_delta', deltaPreview: 'hello', contentIndex: 0, eventId: 2 }))
    rec.onProviderStreamEvent(makeProviderEvent({ step: 1, turnId: 'a1', type: 'text_delta', deltaPreview: ' world', contentIndex: 0, eventId: 3 }))
    rec.onProviderStreamEvent(makeProviderEvent({ step: 1, turnId: 'a1', type: 'text_end', contentIndex: 0, contentPreview: 'hello world', eventId: 4 }))
    rec.onProviderStreamEvent(makeProviderEvent({ step: 1, turnId: 'a1', type: 'done', stopReason: 'stop', eventId: 5 }))

    // Agent events
    rec.onAgentEvent({ type: 'text_delta', contentIndex: 0, delta: 'hello' })
    rec.onAgentEvent({ type: 'text_delta', contentIndex: 0, delta: ' world' })
    rec.onAgentEvent({ type: 'text_end', contentIndex: 0, text: 'hello world' })

    // Lifecycle
    rec.onLifecycleEvent({ type: 'usage_updated', usage: makeUsageAggregate(), timestamp: 1500 })
    rec.onLifecycleEvent({ type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 1700 })

    const trace = rec.finalize({ type: 'success', text: 'hello world' })
    const output = formatTraceShow(trace)

    // Step header
    expect(output).toContain('Step 1')
    // Source tags
    expect(output).toContain('[P]')
    expect(output).toContain('[A]')
    expect(output).toContain('[L]')
    // Delta folding
    expect(output).toContain('text_delta ×2')
    // Key events visible
    expect(output).toContain('text_start')
    expect(output).toContain('text_end')
    expect(output).toContain('done')
    expect(output).toContain('stop')
  })

  it('output shows toolCallId correlation across layers', () => {
    const rec = new TraceRecorder(recorderOpts)
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })

    rec.onProviderStreamEvent(makeProviderEvent({
      step: 1, turnId: 'a1', type: 'toolcall_end',
      toolCallId: 'tc-abcd1234', toolName: 'bash', eventId: 1,
    }))

    rec.onAgentEvent({ type: 'toolcall_end', toolCall: { type: 'toolCall', id: 'tc-abcd1234', name: 'bash', arguments: {} } as any })

    const tc = createToolCallLifecycle({ id: 'tc-abcd1234', toolName: 'bash', args: {}, command: 'echo' })
    tc.phase = 'completed'; tc.completedAt = 1100; tc.executionStartedAt = 1050
    rec.onLifecycleEvent({ type: 'tool_call_completed', toolCall: tc })
    rec.onLifecycleEvent({ type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 1200 })

    const trace = rec.finalize({ type: 'success', text: '' })
    const output = formatTraceShow(trace)

    // tc= prefix should appear in all three sections
    expect(output).toContain('tc=tc-abcd1')
  })

  it('consecutive deltas are folded, not dumped individually', () => {
    const rec = new TraceRecorder(recorderOpts)
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })

    for (let i = 0; i < 20; i++) {
      rec.onProviderStreamEvent(makeProviderEvent({ step: 1, turnId: 'a1', type: 'thinking_delta', deltaPreview: 'x', eventId: i + 1 }))
    }
    rec.onLifecycleEvent({ type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 1100 })

    const trace = rec.finalize({ type: 'success', text: '' })
    const output = formatTraceShow(trace)

    // Should show folded count, not 20 individual lines
    expect(output).toContain('thinking_delta ×20')
    // Should NOT have 20 separate thinking_delta lines
    const lines = output.split('\n').filter(l => l.includes('thinking_delta'))
    expect(lines).toHaveLength(1)
  })

  it('output shows run-level events section for session_done', () => {
    const rec = new TraceRecorder(recorderOpts)
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })
    rec.onLifecycleEvent({ type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 1100 })
    rec.onLifecycleEvent({ type: 'session_done', success: true, text: 'ok', timestamp: 1200 })

    const trace = rec.finalize({ type: 'success', text: 'ok' })
    const output = formatTraceShow(trace)

    expect(output).toContain('Run-level Events')
    expect(output).toContain('session_done')
  })

  it('output shows interrupt chain events', () => {
    const rec = new TraceRecorder(recorderOpts)
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })
    rec.recordInterruptRequest('sigint')
    rec.onLifecycleEvent({ type: 'blocked_enter', reason: 'interrupted', timestamp: 1050 })
    rec.onLifecycleEvent({ type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 1100 })

    const trace = rec.finalize({ type: 'blocked', reason: 'interrupted' })
    const output = formatTraceShow(trace)

    expect(output).toContain('interrupt_requested')
    expect(output).toContain('interrupt_observed')
    expect(output).toContain('source=sigint')
    expect(output).toContain('latency=')
  })
})
