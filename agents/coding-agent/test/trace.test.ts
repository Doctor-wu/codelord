import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { TraceRecorder } from '../src/trace-recorder.js'
import { TraceStore } from '../src/trace-store.js'
import type { LifecycleEvent } from '@agent/core'
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
  provider: 'anthropic',
  model: 'claude-3',
  systemPrompt: 'You are a test agent.',
}

function makeUsageAggregate(overrides: Partial<UsageAggregate> = {}): UsageAggregate {
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
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// TraceRecorder
// ---------------------------------------------------------------------------

describe('TraceRecorder', () => {
  it('builds a trace from llm + tool execution events', () => {
    const rec = new TraceRecorder(recorderOpts)

    // Step 1: assistant turn with LLM call
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })
    rec.onLifecycleEvent({ type: 'usage_updated', usage: makeUsageAggregate(), timestamp: 1500 })

    // Tool execution
    const tc = createToolCallLifecycle({ id: 'tc-1', toolName: 'file_read', args: { file_path: '/tmp/foo.txt' }, command: '/tmp/foo.txt' })
    tc.phase = 'completed'
    tc.result = 'file content here'
    tc.completedAt = 1600
    tc.executionStartedAt = 1550
    rec.onLifecycleEvent({ type: 'tool_call_completed', toolCall: tc })

    rec.onLifecycleEvent({ type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 1700 })

    const trace = rec.finalize({ type: 'success', text: 'done' })

    expect(trace.runId).toBeTruthy()
    expect(trace.sessionId).toBe('sess-1')
    expect(trace.systemPromptHash).toBeTruthy()
    expect(trace.outcome.type).toBe('success')
    expect(trace.steps).toHaveLength(1)
    expect(trace.steps[0].events).toHaveLength(2) // llm_call + tool_execution
    expect(trace.steps[0].events[0].type).toBe('llm_call')
    expect(trace.steps[0].events[1].type).toBe('tool_execution')
    expect(trace.usageSummary.llmCalls).toBe(1)
    expect(trace.usageSummary.totalTokens).toBe(190)
  })

  it('records queue_message events from queue_drained', () => {
    const rec = new TraceRecorder(recorderOpts)
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })
    rec.onLifecycleEvent({
      type: 'queue_drained',
      count: 2,
      messages: [
        { content: 'first', enqueuedAt: 900 },
        { content: 'second', enqueuedAt: 950 },
      ],
      injectedAt: 1000,
    })
    rec.onLifecycleEvent({ type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 1100 })

    const trace = rec.finalize({ type: 'success', text: '' })
    const queueEvents = trace.steps[0].events.filter(e => e.type === 'queue_message')
    expect(queueEvents).toHaveLength(2)
    expect(queueEvents[0].type === 'queue_message' && queueEvents[0].waitMs).toBe(100)
    expect(queueEvents[1].type === 'queue_message' && queueEvents[1].waitMs).toBe(50)
  })

  it('records ask_user events', () => {
    const rec = new TraceRecorder(recorderOpts)
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })
    rec.onLifecycleEvent({
      type: 'blocked_enter',
      reason: 'waiting_user',
      question: 'Which DB?',
      questionDetail: { question: 'Which DB?', whyAsk: 'Need to know' },
      timestamp: 1100,
    })

    const trace = rec.finalize({ type: 'blocked', reason: 'waiting_user' })
    const askEvents = trace.steps.flatMap(s => s.events).filter(e => e.type === 'ask_user')
    expect(askEvents).toHaveLength(1)
    expect(askEvents[0].type === 'ask_user' && askEvents[0].answeredAt).toBeNull()
  })

  it('records question_answered events', () => {
    const rec = new TraceRecorder(recorderOpts)
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })
    rec.onLifecycleEvent({
      type: 'question_answered',
      question: 'Which DB?',
      whyAsk: 'Need to know',
      askedAt: 1100,
      answer: 'postgres',
      answeredAt: 5000,
    })

    const trace = rec.finalize({ type: 'success', text: '' })
    const answered = trace.steps.flatMap(s => s.events).filter(e => e.type === 'ask_user')
    expect(answered).toHaveLength(1)
    expect(answered[0].type === 'ask_user' && answered[0].waitMs).toBe(3900)
  })

  it('records user_interrupt events', () => {
    const rec = new TraceRecorder(recorderOpts)
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })
    rec.recordInterruptRequest()
    rec.onLifecycleEvent({ type: 'blocked_enter', reason: 'interrupted', timestamp: 1200 })

    const trace = rec.finalize({ type: 'blocked', reason: 'interrupted' })
    const interrupts = trace.steps.flatMap(s => s.events).filter(e => e.type === 'user_interrupt')
    expect(interrupts).toHaveLength(1)
    expect(interrupts[0].type === 'user_interrupt' && interrupts[0].source).toBe('sigint')
  })

  it('redacts secrets in tool output previews', () => {
    const rec = new TraceRecorder(recorderOpts)
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })

    const tc = createToolCallLifecycle({ id: 'tc-1', toolName: 'bash', args: { command: 'echo' }, command: 'echo' })
    tc.phase = 'completed'
    tc.result = 'API key: sk-aaaabbbbccccddddeeeeffffgggg'
    tc.stdout = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig'
    tc.completedAt = 1100
    tc.executionStartedAt = 1050
    rec.onLifecycleEvent({ type: 'tool_call_completed', toolCall: tc })

    const trace = rec.finalize({ type: 'success', text: '' })
    const toolEvent = trace.steps[0].events.find(e => e.type === 'tool_execution')
    expect(toolEvent?.type === 'tool_execution' && toolEvent.resultPreview).toContain('[REDACTED:API_KEY]')
    expect(toolEvent?.type === 'tool_execution' && toolEvent.stdoutPreview).toContain('[REDACTED:BEARER_TOKEN]')
    expect(trace.redactionSummary.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// TraceStore
// ---------------------------------------------------------------------------

describe('TraceStore', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs) {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
    }
    dirs.length = 0
  })

  it('writes trace JSON to disk', () => {
    const dir = makeTmpDir()
    dirs.push(dir)
    const store = new TraceStore(dir)

    const rec = new TraceRecorder(recorderOpts)
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })
    rec.onLifecycleEvent({ type: 'usage_updated', usage: makeUsageAggregate(), timestamp: 1500 })
    rec.onLifecycleEvent({ type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 1700 })

    const trace = rec.finalize({ type: 'success', text: 'ok' })
    store.save(trace)

    const files = readdirSync(dir)
    expect(files).toHaveLength(1)
    expect(files[0]).toBe(`${trace.runId}.json`)

    const loaded = JSON.parse(readFileSync(join(dir, files[0]), 'utf-8'))
    expect(loaded.runId).toBe(trace.runId)
    expect(loaded.sessionId).toBe('sess-1')
    expect(loaded.steps).toHaveLength(1)
  })

  it('trace on disk has redacted content, not raw secrets', () => {
    const dir = makeTmpDir()
    dirs.push(dir)
    const store = new TraceStore(dir)

    const rec = new TraceRecorder(recorderOpts)
    rec.onLifecycleEvent({ type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })

    const tc = createToolCallLifecycle({ id: 'tc-1', toolName: 'bash', args: {}, command: 'echo' })
    tc.phase = 'completed'
    tc.result = 'secret: sk-aaaabbbbccccddddeeeeffffgggg'
    tc.completedAt = 1100
    tc.executionStartedAt = 1050
    rec.onLifecycleEvent({ type: 'tool_call_completed', toolCall: tc })

    const trace = rec.finalize({ type: 'success', text: '' })
    store.save(trace)

    const raw = readFileSync(join(dir, `${trace.runId}.json`), 'utf-8')
    expect(raw).not.toContain('sk-aaaa')
    expect(raw).toContain('[REDACTED:API_KEY]')
  })
})
