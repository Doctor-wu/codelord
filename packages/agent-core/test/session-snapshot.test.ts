import { afterEach, describe, expect, it, vi } from 'vitest'

const { streamSimpleMock } = vi.hoisted(() => ({
  streamSimpleMock: vi.fn(),
}))

vi.mock('@mariozechner/pi-ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mariozechner/pi-ai')>()
  return {
    ...actual,
    streamSimple: streamSimpleMock,
  }
})

import { AgentRuntime } from '../src/runtime.js'
import type { SessionSnapshot } from '../src/session-snapshot.js'
import { resolveResumeState, toSessionMeta } from '../src/session-snapshot.js'
import { ASK_USER_QUESTION_TOOL_NAME } from '../src/tools/ask-user.js'

function makeAssistantMessage(overrides = {}) {
  return {
    role: 'assistant',
    content: [],
    stopReason: 'stop',
    timestamp: Date.now(),
    ...overrides,
  }
}

function makeEventStream(events: unknown[], resultMessage = makeAssistantMessage()) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event
      }
    },
    async result() {
      return resultMessage
    },
  }
}

function createRuntime(onEvent?: (e: unknown) => void) {
  return new AgentRuntime({
    model: { id: 'test-model' } as never,
    systemPrompt: 'You are a test agent.',
    tools: [],
    toolHandlers: new Map(),
    apiKey: 'test-key',
    onEvent,
  })
}

const snapshotMeta = {
  sessionId: 'test-session-1',
  cwd: '/tmp/test',
  provider: 'openai',
  model: 'gpt-4',
}

// ---------------------------------------------------------------------------
// 1. READY state session can be saved and restored
// ---------------------------------------------------------------------------

describe('Session snapshot: READY state', () => {
  afterEach(() => { streamSimpleMock.mockReset() })

  it('exports and restores a READY session', async () => {
    const msg = makeAssistantMessage({ content: [{ type: 'text', text: 'hello' }] })
    streamSimpleMock.mockReturnValueOnce(makeEventStream([{ type: 'done', message: msg }], msg))

    const rt = createRuntime()
    rt.enqueueUserMessage('hi')
    await rt.run()
    expect(rt.state).toBe('READY')

    const snapshot = rt.exportSnapshot(snapshotMeta)
    expect(snapshot.runtimeState).toBe('READY')
    expect(snapshot.wasInFlight).toBe(false)
    expect(snapshot.messages).toHaveLength(2)

    // Restore into a fresh runtime
    const rt2 = createRuntime()
    const { wasDowngraded } = rt2.hydrateFromSnapshot(snapshot)
    expect(wasDowngraded).toBe(false)
    expect(rt2.state).toBe('READY')
    expect(rt2.messages).toHaveLength(2)
    expect(rt2.sessionStepCount).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// 2. waiting_user state session can be saved and restored
// ---------------------------------------------------------------------------

describe('Session snapshot: waiting_user (BLOCKED)', () => {
  afterEach(() => { streamSimpleMock.mockReset() })

  it('exports and restores a BLOCKED/waiting_user session', async () => {
    const askToolCall = {
      type: 'toolCall',
      id: 'tc-ask',
      name: ASK_USER_QUESTION_TOOL_NAME,
      arguments: { question: 'Which DB?', why_ask: 'Need to know' },
    }
    const assistantWithAsk = makeAssistantMessage({
      content: [askToolCall],
      stopReason: 'toolUse',
    })

    streamSimpleMock.mockReturnValueOnce(
      makeEventStream([
        { type: 'toolcall_end', toolCall: askToolCall },
        { type: 'done', message: assistantWithAsk },
      ], assistantWithAsk),
    )

    const rt = createRuntime()
    rt.enqueueUserMessage('setup')
    await rt.run()
    expect(rt.state).toBe('BLOCKED')
    expect(rt.pendingQuestion).not.toBeNull()

    const snapshot = rt.exportSnapshot(snapshotMeta)
    expect(snapshot.runtimeState).toBe('BLOCKED')
    expect(snapshot.pendingQuestion?.question).toBe('Which DB?')

    // Restore
    const rt2 = createRuntime()
    rt2.hydrateFromSnapshot(snapshot)
    expect(rt2.state).toBe('BLOCKED')
    expect(rt2.pendingQuestion?.question).toBe('Which DB?')
    expect(rt2.pendingQuestion?.whyAsk).toBe('Need to know')
  })
})

// ---------------------------------------------------------------------------
// 3. Pending question can be answered after restore
// ---------------------------------------------------------------------------

describe('Session snapshot: pending question answer after restore', () => {
  afterEach(() => { streamSimpleMock.mockReset() })

  it('restored pending question can be answered normally', async () => {
    const askToolCall = {
      type: 'toolCall',
      id: 'tc-ask',
      name: ASK_USER_QUESTION_TOOL_NAME,
      arguments: {
        question: 'Which DB?',
        why_ask: 'Need to know',
        options: ['postgres', 'mysql'],
      },
    }
    const assistantWithAsk = makeAssistantMessage({
      content: [askToolCall],
      stopReason: 'toolUse',
    })

    streamSimpleMock.mockReturnValueOnce(
      makeEventStream([
        { type: 'toolcall_end', toolCall: askToolCall },
        { type: 'done', message: assistantWithAsk },
      ], assistantWithAsk),
    )

    const rt = createRuntime()
    rt.enqueueUserMessage('setup')
    await rt.run()

    // Snapshot while blocked
    const snapshot = rt.exportSnapshot(snapshotMeta)

    // Restore into fresh runtime
    const rt2 = createRuntime()
    rt2.hydrateFromSnapshot(snapshot)

    // Answer the question
    rt2.answerPendingQuestion('postgres')
    expect(rt2.pendingQuestion).toBeNull()
    expect(rt2.resolvedQuestions).toHaveLength(1)
    expect(rt2.resolvedQuestions[0].answer).toBe('postgres')

    // Resume should work
    const resumeMsg = makeAssistantMessage({ content: [{ type: 'text', text: 'Using postgres!' }] })
    streamSimpleMock.mockReturnValueOnce(makeEventStream([{ type: 'done', message: resumeMsg }], resumeMsg))

    const outcome = await rt2.run()
    expect(outcome).toEqual({ type: 'success', text: 'Using postgres!' })
  })
})

// ---------------------------------------------------------------------------
// 4. pendingInbound can be saved and restored
// ---------------------------------------------------------------------------

describe('Session snapshot: pendingInbound persistence', () => {
  it('saves and restores pending inbound queue', () => {
    const rt = createRuntime()
    rt.enqueueUserMessage('first')
    rt.enqueueUserMessage('second')

    const snapshot = rt.exportSnapshot(snapshotMeta)
    expect(snapshot.pendingInbound).toHaveLength(2)

    const rt2 = createRuntime()
    rt2.hydrateFromSnapshot(snapshot)
    expect(rt2.pendingInboundCount).toBe(2)
    expect(rt2.pendingInboundPreviews).toEqual(['first', 'second'])
  })
})

// ---------------------------------------------------------------------------
// 5. Queue message order is preserved
// ---------------------------------------------------------------------------

describe('Session snapshot: queue order preservation', () => {
  afterEach(() => { streamSimpleMock.mockReset() })

  it('preserves queue message order through save/restore', async () => {
    const rt = createRuntime()
    rt.enqueueUserMessage('alpha')
    rt.enqueueUserMessage('beta')
    rt.enqueueUserMessage('gamma')

    const snapshot = rt.exportSnapshot(snapshotMeta)

    const rt2 = createRuntime()
    rt2.hydrateFromSnapshot(snapshot)

    expect(rt2.pendingInboundPreviews).toEqual(['alpha', 'beta', 'gamma'])

    // Run and verify they drain in order
    const msg = makeAssistantMessage({ content: [{ type: 'text', text: 'ok' }] })
    streamSimpleMock.mockReturnValueOnce(makeEventStream([{ type: 'done', message: msg }], msg))

    await rt2.run()
    const userMsgs = rt2.messages.filter(m => m.role === 'user')
    expect(userMsgs.map(m => m.content)).toEqual(['alpha', 'beta', 'gamma'])
  })
})

// ---------------------------------------------------------------------------
// 7. In-flight states are downgraded, not faked
// ---------------------------------------------------------------------------

describe('Session snapshot: in-flight state handling', () => {
  it('STREAMING state is downgraded to READY on resume', () => {
    const snapshot: SessionSnapshot = {
      version: 1,
      sessionId: 'test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      cwd: '/tmp',
      provider: 'openai',
      model: 'gpt-4',
      gitBranch: null,
      runtimeState: 'STREAMING',
      wasInFlight: true,
      messages: [{ role: 'user', content: 'hi', timestamp: Date.now() }],
      pendingInbound: [],
      pendingQuestion: null,
      resolvedQuestions: [],
      lastOutcome: null,
      routeRecords: [],
      safetyRecords: [],
      sessionStepCount: 1,
      checkpoints: [],
      usageAggregate: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }, llmCalls: 0, lastCall: null },
    }

    const { state, wasDowngraded, interruptedDuring } = resolveResumeState(snapshot)
    expect(state).toBe('READY')
    expect(wasDowngraded).toBe(true)
    expect(interruptedDuring).toBe('STREAMING')

    // Verify runtime hydration
    const rt = createRuntime()
    const result = rt.hydrateFromSnapshot(snapshot)
    expect(rt.state).toBe('READY')
    expect(result.wasDowngraded).toBe(true)
    expect(result.interruptedDuring).toBe('STREAMING')
    // Messages are preserved
    expect(rt.messages).toHaveLength(1)
  })

  it('TOOL_EXEC state is downgraded to READY on resume', () => {
    const snapshot: SessionSnapshot = {
      version: 1,
      sessionId: 'test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      cwd: '/tmp',
      provider: 'openai',
      model: 'gpt-4',
      gitBranch: null,
      runtimeState: 'TOOL_EXEC',
      wasInFlight: true,
      messages: [
        { role: 'user', content: 'hi', timestamp: Date.now() },
        { role: 'assistant', content: [{ type: 'text', text: 'ok' }], stopReason: 'stop', timestamp: Date.now() } as any,
      ],
      pendingInbound: [{ role: 'user', content: 'queued', timestamp: Date.now() }],
      pendingQuestion: null,
      resolvedQuestions: [],
      lastOutcome: null,
      routeRecords: [],
      safetyRecords: [],
      sessionStepCount: 3,
      checkpoints: [],
      usageAggregate: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, totalTokens: 150, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }, llmCalls: 1, lastCall: null },
    }

    const rt = createRuntime()
    const result = rt.hydrateFromSnapshot(snapshot)
    expect(rt.state).toBe('READY')
    expect(result.wasDowngraded).toBe(true)
    expect(result.interruptedDuring).toBe('TOOL_EXEC')
    // Queue preserved
    expect(rt.pendingInboundCount).toBe(1)
    // History preserved
    expect(rt.messages).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// 9. Auth secrets are NOT in snapshot
// ---------------------------------------------------------------------------

describe('Session snapshot: no auth secrets', () => {
  it('snapshot does not contain apiKey or auth tokens', () => {
    const rt = createRuntime()
    const snapshot = rt.exportSnapshot(snapshotMeta)

    const json = JSON.stringify(snapshot)
    expect(json).not.toContain('test-key')
    expect(json).not.toContain('apiKey')
    expect(json).not.toContain('token')

    // Verify the snapshot type doesn't have these fields
    expect(snapshot).not.toHaveProperty('apiKey')
    expect(snapshot).not.toHaveProperty('token')
    expect(snapshot).not.toHaveProperty('secret')
  })
})

// ---------------------------------------------------------------------------
// toSessionMeta
// ---------------------------------------------------------------------------

describe('toSessionMeta', () => {
  it('extracts lightweight metadata from snapshot', () => {
    const snapshot: SessionSnapshot = {
      version: 1,
      sessionId: 'meta-test',
      createdAt: 1000,
      updatedAt: 2000,
      cwd: '/home/user/project',
      provider: 'anthropic',
      model: 'claude-3',
      gitBranch: 'main',
      runtimeState: 'BLOCKED',
      wasInFlight: false,
      messages: [{ role: 'user', content: 'hi', timestamp: 1000 }],
      pendingInbound: [{ role: 'user', content: 'queued', timestamp: 1500 }],
      pendingQuestion: { toolCallId: 'tc-1', question: 'Q?', whyAsk: 'W' },
      resolvedQuestions: [],
      lastOutcome: { type: 'blocked', reason: 'waiting_user' },
      routeRecords: [],
      safetyRecords: [],
      sessionStepCount: 5,
      checkpoints: [],
      usageAggregate: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }, llmCalls: 0, lastCall: null },
    }

    const meta = toSessionMeta(snapshot)
    expect(meta.sessionId).toBe('meta-test')
    expect(meta.cwd).toBe('/home/user/project')
    expect(meta.messageCount).toBe(1)
    expect(meta.pendingInboundCount).toBe(1)
    expect(meta.hasPendingQuestion).toBe(true)
    expect(meta.runtimeState).toBe('BLOCKED')
    expect(meta.gitBranch).toBe('main')
    expect(meta.title).toBe('hi')
  })

  const metaBase: SessionSnapshot = {
    version: 1,
    sessionId: 'x',
    createdAt: 0,
    updatedAt: 0,
    cwd: '/',
    provider: 'p',
    model: 'm',
    gitBranch: null,
    runtimeState: 'READY',
    wasInFlight: false,
    messages: [],
    pendingInbound: [],
    pendingQuestion: null,
    resolvedQuestions: [],
    lastOutcome: null,
    routeRecords: [],
    safetyRecords: [],
    sessionStepCount: 0,
    checkpoints: [],
    usageAggregate: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }, llmCalls: 0, lastCall: null },
  }

  it('extracts title from first user message', () => {
    const snapshot: SessionSnapshot = {
      ...metaBase,
      messages: [
        { role: 'user', content: 'Fix the bug in utils.ts', timestamp: 1000 },
        { role: 'assistant', content: [{ type: 'text', text: 'Done!' }], stopReason: 'stop', timestamp: 2000 } as any,
      ],
    }
    const meta = toSessionMeta(snapshot)
    expect(meta.title).toBe('Fix the bug in utils.ts')
  })

  it('truncates long titles to 60 chars', () => {
    const snapshot: SessionSnapshot = {
      ...metaBase,
      messages: [
        { role: 'user', content: 'x'.repeat(100), timestamp: 1000 },
      ],
    }
    const meta = toSessionMeta(snapshot)
    expect(meta.title!.length).toBeLessThanOrEqual(60)
    expect(meta.title!.endsWith('...')).toBe(true)
  })

  it('extracts summary from last assistant text', () => {
    const snapshot: SessionSnapshot = {
      ...metaBase,
      messages: [
        { role: 'user', content: 'hi', timestamp: 1000 },
        { role: 'assistant', content: [{ type: 'text', text: 'I fixed the import statement.' }], stopReason: 'stop', timestamp: 2000 } as any,
      ],
    }
    const meta = toSessionMeta(snapshot)
    expect(meta.summary).toBe('I fixed the import statement.')
  })

  it('truncates long summaries to 100 chars', () => {
    const snapshot: SessionSnapshot = {
      ...metaBase,
      messages: [
        { role: 'user', content: 'hi', timestamp: 1000 },
        { role: 'assistant', content: [{ type: 'text', text: 'y'.repeat(200) }], stopReason: 'stop', timestamp: 2000 } as any,
      ],
    }
    const meta = toSessionMeta(snapshot)
    expect(meta.summary!.length).toBeLessThanOrEqual(100)
    expect(meta.summary!.endsWith('...')).toBe(true)
  })

  it('returns null title/summary when no messages', () => {
    const snapshot: SessionSnapshot = { ...metaBase, messages: [] }
    const meta = toSessionMeta(snapshot)
    expect(meta.title).toBeNull()
    expect(meta.summary).toBeNull()
  })

  it('returns null gitBranch when not set in snapshot', () => {
    const snapshot: SessionSnapshot = { ...metaBase, gitBranch: null }
    const meta = toSessionMeta(snapshot)
    expect(meta.gitBranch).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// resolveResumeState
// ---------------------------------------------------------------------------

describe('resolveResumeState', () => {
  const base: SessionSnapshot = {
    version: 1,
    sessionId: 'x',
    createdAt: 0,
    updatedAt: 0,
    cwd: '/',
    provider: 'p',
    model: 'm',
    gitBranch: null,
    runtimeState: 'READY',
    wasInFlight: false,
    messages: [],
    pendingInbound: [],
    pendingQuestion: null,
    resolvedQuestions: [],
    lastOutcome: null,
    routeRecords: [],
    safetyRecords: [],
    sessionStepCount: 0,
    checkpoints: [],
    usageAggregate: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }, llmCalls: 0, lastCall: null },
  }

  it.each([
    ['IDLE', false],
    ['READY', false],
    ['BLOCKED', false],
  ] as const)('%s is not downgraded', (state, expectedDowngrade) => {
    const result = resolveResumeState({ ...base, runtimeState: state })
    expect(result.state).toBe(state)
    expect(result.wasDowngraded).toBe(expectedDowngrade)
    expect(result.interruptedDuring).toBeNull()
  })

  it.each([
    ['STREAMING'],
    ['TOOL_EXEC'],
  ] as const)('%s is downgraded to READY', (state) => {
    const result = resolveResumeState({ ...base, runtimeState: state, wasInFlight: true })
    expect(result.state).toBe('READY')
    expect(result.wasDowngraded).toBe(true)
    expect(result.interruptedDuring).toBe(state)
  })
})
