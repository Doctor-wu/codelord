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
import type { RuntimeState, RunOutcome } from '../src/runtime.js'
import { ASK_USER_QUESTION_TOOL_NAME } from '../src/tools/ask-user.js'
import type { PendingQuestion } from '../src/tools/ask-user.js'

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

describe('AgentRuntime', () => {
  afterEach(() => {
    streamSimpleMock.mockReset()
  })

  it('starts in IDLE state', () => {
    const rt = createRuntime()
    expect(rt.state).toBe('IDLE')
    expect(rt.stepCount).toBe(0)
    expect(rt.messages).toEqual([])
  })

  it('runs a single-turn conversation to success', async () => {
    const assistantMessage = makeAssistantMessage({
      content: [{ type: 'text', text: 'Hello world' }],
    })

    streamSimpleMock.mockReturnValueOnce(
      makeEventStream([{ type: 'done', message: assistantMessage }], assistantMessage),
    )

    const rt = createRuntime()
    rt.messages.push({ role: 'user', content: 'Hi', timestamp: Date.now() })

    const outcome = await rt.run()

    expect(outcome).toEqual({ type: 'success', text: 'Hello world' })
    expect(rt.state).toBe('DONE')
    expect(rt.stepCount).toBe(1)
    expect(rt.messages).toHaveLength(2) // user + assistant
  })

  it('handles tool calls and loops back to streaming', async () => {
    const toolCall = {
      type: 'toolCall',
      id: 'tc-1',
      name: 'bash',
      arguments: { command: 'echo hi' },
    }

    const assistantWithTool = makeAssistantMessage({
      content: [toolCall],
      stopReason: 'toolUse',
    })

    const finalAssistant = makeAssistantMessage({
      content: [{ type: 'text', text: 'Done!' }],
    })

    streamSimpleMock
      .mockReturnValueOnce(
        makeEventStream([
          { type: 'toolcall_end', toolCall },
          { type: 'done', message: assistantWithTool },
        ], assistantWithTool),
      )
      .mockReturnValueOnce(
        makeEventStream([{ type: 'done', message: finalAssistant }], finalAssistant),
      )

    const handler = vi.fn().mockResolvedValue('hi\n')

    const rt = new AgentRuntime({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map([['bash', handler]]),
      apiKey: 'test-key',
    })
    rt.messages.push({ role: 'user', content: 'run echo', timestamp: Date.now() })

    const outcome = await rt.run()

    expect(outcome).toEqual({ type: 'success', text: 'Done!' })
    expect(rt.state).toBe('DONE')
    expect(rt.stepCount).toBe(2)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('rejects enqueue on terminal state', async () => {
    const assistantMessage = makeAssistantMessage({
      content: [{ type: 'text', text: 'bye' }],
    })

    streamSimpleMock.mockReturnValueOnce(
      makeEventStream([{ type: 'done', message: assistantMessage }], assistantMessage),
    )

    const rt = createRuntime()
    rt.messages.push({ role: 'user', content: 'Hi', timestamp: Date.now() })
    await rt.run()

    expect(rt.state).toBe('DONE')
    expect(() => rt.enqueue({ role: 'user', content: 'more', timestamp: Date.now() }))
      .toThrow('Cannot enqueue messages in terminal state: DONE')
  })

  it('drains pending messages before LLM call', async () => {
    const assistantMessage = makeAssistantMessage({
      content: [{ type: 'text', text: 'ok' }],
    })

    streamSimpleMock.mockReturnValueOnce(
      makeEventStream([{ type: 'done', message: assistantMessage }], assistantMessage),
    )

    const rt = createRuntime()
    rt.messages.push({ role: 'user', content: 'first', timestamp: Date.now() })

    // Enqueue before run — should be drained at the safe injection point
    rt.enqueue({ role: 'user', content: 'injected', timestamp: Date.now() })

    await rt.run()

    // The injected message should appear in history before the assistant reply
    expect(rt.messages[0].role).toBe('user')
    expect(rt.messages[1].role).toBe('user')
    expect(rt.messages[2].role).toBe('assistant')
  })

  it('accumulates partial text during streaming', async () => {
    const assistantMessage = makeAssistantMessage({
      content: [{ type: 'text', text: 'Hello world' }],
    })

    let capturedPartial: unknown = null

    const rt = new AgentRuntime({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map(),
      apiKey: 'test-key',
      onEvent: (event) => {
        if (event.type === 'text_delta') {
          capturedPartial = rt.partial
        }
      },
    })

    streamSimpleMock.mockReturnValueOnce(
      makeEventStream([
        { type: 'text_start', contentIndex: 0 },
        { type: 'text_delta', contentIndex: 0, delta: 'Hello ' },
        { type: 'text_delta', contentIndex: 0, delta: 'world' },
        { type: 'text_end', contentIndex: 0, content: 'Hello world' },
        { type: 'done', message: assistantMessage },
      ], assistantMessage),
    )

    rt.messages.push({ role: 'user', content: 'Hi', timestamp: Date.now() })
    await rt.run()

    // Partial should have been visible during streaming
    expect(capturedPartial).not.toBeNull()
    // After completion, partial is cleared
    expect(rt.partial).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Interrupt tests
// ---------------------------------------------------------------------------

describe('AgentRuntime interrupt', () => {
  afterEach(() => {
    streamSimpleMock.mockReset()
  })

  it('interrupts during streaming via abort error event, preserves partial', async () => {
    const abortedMsg = makeAssistantMessage({
      stopReason: 'aborted',
      errorMessage: 'Request aborted',
    })

    // Stream yields some text deltas, then an error event with stopReason=aborted
    const rt = createRuntime()
    rt.messages.push({ role: 'user', content: 'Hi', timestamp: Date.now() })

    streamSimpleMock.mockReturnValueOnce({
      async *[Symbol.asyncIterator]() {
        yield { type: 'text_start', contentIndex: 0 }
        yield { type: 'text_delta', contentIndex: 0, delta: 'partial ' }
        yield { type: 'text_delta', contentIndex: 0, delta: 'content' }
        // Simulate: external code calls requestInterrupt() during streaming
        rt.requestInterrupt()
        yield { type: 'error', error: abortedMsg }
      },
      async result() { return abortedMsg },
    })

    const outcome = await rt.run()

    expect(outcome).toEqual({ type: 'blocked', reason: 'interrupted' })
    expect(rt.state).toBe('BLOCKED')
    // Partial is preserved — not committed to messages, not lost
    expect(rt.partial).not.toBeNull()
    expect(rt.partial!.textChunks).toEqual(['partial ', 'content'])
    // Only user message in history — assistant was not committed
    expect(rt.messages).toHaveLength(1)
    expect(rt.messages[0].role).toBe('user')
  })

  it('interrupts during streaming via iterator throw (AbortError)', async () => {
    const rt = createRuntime()
    rt.messages.push({ role: 'user', content: 'Hi', timestamp: Date.now() })

    streamSimpleMock.mockReturnValueOnce({
      async *[Symbol.asyncIterator]() {
        yield { type: 'text_start', contentIndex: 0 }
        yield { type: 'text_delta', contentIndex: 0, delta: 'hello' }
        rt.requestInterrupt()
        // Simulate AbortError thrown by stream
        throw new DOMException('The operation was aborted', 'AbortError')
      },
      async result() { return makeAssistantMessage() },
    })

    const outcome = await rt.run()

    expect(outcome).toEqual({ type: 'blocked', reason: 'interrupted' })
    expect(rt.state).toBe('BLOCKED')
    expect(rt.partial!.textChunks).toEqual(['hello'])
  })

  it('interrupt during tool exec waits for current tool, then blocks', async () => {
    const toolCall = {
      type: 'toolCall',
      id: 'tc-1',
      name: 'bash',
      arguments: { command: 'slow' },
    }
    const toolCall2 = {
      type: 'toolCall',
      id: 'tc-2',
      name: 'bash',
      arguments: { command: 'skipped' },
    }

    const assistantWithTools = makeAssistantMessage({
      content: [toolCall, toolCall2],
      stopReason: 'toolUse',
    })

    streamSimpleMock.mockReturnValueOnce(
      makeEventStream([
        { type: 'toolcall_end', toolCall },
        { type: 'toolcall_end', toolCall: toolCall2 },
        { type: 'done', message: assistantWithTools },
      ], assistantWithTools),
    )

    let toolCallCount = 0
    const handler = vi.fn().mockImplementation(async (args: Record<string, unknown>) => {
      toolCallCount++
      if (toolCallCount === 1) {
        // First tool completes, but interrupt is requested during it
        rt.requestInterrupt()
      }
      return `result-${toolCallCount}`
    })

    const rt = new AgentRuntime({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map([['bash', handler]]),
      apiKey: 'test-key',
    })
    rt.messages.push({ role: 'user', content: 'run', timestamp: Date.now() })

    const outcome = await rt.run()

    expect(outcome).toEqual({ type: 'blocked', reason: 'interrupted' })
    expect(rt.state).toBe('BLOCKED')
    // First tool completed (not killed), second tool was skipped
    expect(handler).toHaveBeenCalledTimes(1)
    // Messages: user + assistant + toolResult for first tool
    expect(rt.messages).toHaveLength(3)
  })

  it('interrupt before run starts returns blocked immediately', async () => {
    const rt = createRuntime()
    rt.messages.push({ role: 'user', content: 'Hi', timestamp: Date.now() })
    rt.requestInterrupt()

    const outcome = await rt.run()

    expect(outcome).toEqual({ type: 'blocked', reason: 'interrupted' })
    expect(rt.state).toBe('BLOCKED')
    // streamSimple should never have been called
    expect(streamSimpleMock).not.toHaveBeenCalled()
  })

  it('can resume after interrupt by enqueuing message and calling run()', async () => {
    const abortedMsg = makeAssistantMessage({
      stopReason: 'aborted',
      errorMessage: 'Request aborted',
    })

    const rt = createRuntime()
    rt.messages.push({ role: 'user', content: 'Hi', timestamp: Date.now() })

    // First run: gets interrupted
    streamSimpleMock.mockReturnValueOnce({
      async *[Symbol.asyncIterator]() {
        yield { type: 'text_delta', contentIndex: 0, delta: 'partial' }
        rt.requestInterrupt()
        yield { type: 'error', error: abortedMsg }
      },
      async result() { return abortedMsg },
    })

    const outcome1 = await rt.run()
    expect(outcome1).toEqual({ type: 'blocked', reason: 'interrupted' })

    // Resume: enqueue new message and run again
    const resumeAssistant = makeAssistantMessage({
      content: [{ type: 'text', text: 'Resumed!' }],
    })
    streamSimpleMock.mockReturnValueOnce(
      makeEventStream([{ type: 'done', message: resumeAssistant }], resumeAssistant),
    )

    rt.enqueueUserMessage('continue please')
    const outcome2 = await rt.run()

    expect(outcome2).toEqual({ type: 'success', text: 'Resumed!' })
    expect(rt.state).toBe('DONE')
  })
})

// ---------------------------------------------------------------------------
// enqueueUserMessage convenience
// ---------------------------------------------------------------------------

describe('AgentRuntime enqueueUserMessage', () => {
  afterEach(() => {
    streamSimpleMock.mockReset()
  })

  it('enqueues a properly formatted user message', async () => {
    const assistantMessage = makeAssistantMessage({
      content: [{ type: 'text', text: 'ok' }],
    })

    streamSimpleMock.mockReturnValueOnce(
      makeEventStream([{ type: 'done', message: assistantMessage }], assistantMessage),
    )

    const rt = createRuntime()
    rt.messages.push({ role: 'user', content: 'first', timestamp: Date.now() })
    rt.enqueueUserMessage('second')

    await rt.run()

    expect(rt.messages[1].role).toBe('user')
    expect(rt.messages[1].content).toBe('second')
    expect(rt.messages[1]).toHaveProperty('timestamp')
  })
})

// ---------------------------------------------------------------------------
// AskUserQuestion tests
// ---------------------------------------------------------------------------

describe('AgentRuntime AskUserQuestion', () => {
  afterEach(() => {
    streamSimpleMock.mockReset()
  })

  const askToolCall = {
    type: 'toolCall',
    id: 'tc-ask-1',
    name: ASK_USER_QUESTION_TOOL_NAME,
    arguments: {
      question: 'Which database should I use?',
      why_ask: 'The config does not specify a database engine.',
      expected_answer_format: 'postgres or mysql',
      options: ['postgres', 'mysql'],
    },
  }

  it('blocks with waiting_user when AskUserQuestion is called', async () => {
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

    const events: unknown[] = []
    const rt = new AgentRuntime({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map(),
      apiKey: 'test-key',
      onEvent: (e) => events.push(e),
    })
    rt.messages.push({ role: 'user', content: 'setup db', timestamp: Date.now() })

    const outcome = await rt.run()

    expect(outcome).toEqual({ type: 'blocked', reason: 'waiting_user' })
    expect(rt.state).toBe('BLOCKED')
    expect(rt.pendingQuestion).not.toBeNull()
    expect(rt.pendingQuestion!.question).toBe('Which database should I use?')
    expect(rt.pendingQuestion!.whyAsk).toBe('The config does not specify a database engine.')
    expect(rt.pendingQuestion!.options).toEqual(['postgres', 'mysql'])
    // waiting_user event was emitted
    expect(events.some((e: any) => e.type === 'waiting_user')).toBe(true)
  })

  it('stores structured pending question with all fields', async () => {
    const fullAskToolCall = {
      ...askToolCall,
      arguments: {
        ...askToolCall.arguments,
        default_plan_if_no_answer: 'Will default to postgres',
      },
    }
    const assistantWithAsk = makeAssistantMessage({
      content: [fullAskToolCall],
      stopReason: 'toolUse',
    })

    streamSimpleMock.mockReturnValueOnce(
      makeEventStream([
        { type: 'toolcall_end', toolCall: fullAskToolCall },
        { type: 'done', message: assistantWithAsk },
      ], assistantWithAsk),
    )

    const rt = createRuntime()
    rt.messages.push({ role: 'user', content: 'go', timestamp: Date.now() })
    await rt.run()

    const q = rt.pendingQuestion!
    expect(q.toolCallId).toBe('tc-ask-1')
    expect(q.defaultPlanIfNoAnswer).toBe('Will default to postgres')
    expect(q.expectedAnswerFormat).toBe('postgres or mysql')
  })

  it('resumes after user answers the pending question', async () => {
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
    rt.messages.push({ role: 'user', content: 'setup db', timestamp: Date.now() })

    // First run: blocks with waiting_user
    const outcome1 = await rt.run()
    expect(outcome1).toEqual({ type: 'blocked', reason: 'waiting_user' })

    // Answer the question
    rt.answerPendingQuestion('postgres')
    expect(rt.pendingQuestion).toBeNull()

    // The answer should be a normal user message, NOT a toolResult
    const lastMsg = rt.messages[rt.messages.length - 1]
    expect(lastMsg.role).toBe('user')
    expect(lastMsg.content).toBe('postgres')
    // No toolResult for AskUserQuestion in history
    const hasAskToolResult = rt.messages.some(
      (m: any) => m.role === 'toolResult' && m.toolName === ASK_USER_QUESTION_TOOL_NAME,
    )
    expect(hasAskToolResult).toBe(false)

    // Correlation preserved in side channel
    expect(rt.resolvedQuestions).toHaveLength(1)
    expect(rt.resolvedQuestions[0].question.toolCallId).toBe('tc-ask-1')
    expect(rt.resolvedQuestions[0].answer).toBe('postgres')

    // Resume: run again
    const resumeAssistant = makeAssistantMessage({
      content: [{ type: 'text', text: 'Using postgres!' }],
    })
    streamSimpleMock.mockReturnValueOnce(
      makeEventStream([{ type: 'done', message: resumeAssistant }], resumeAssistant),
    )

    const outcome2 = await rt.run()
    expect(outcome2).toEqual({ type: 'success', text: 'Using postgres!' })
    expect(rt.state).toBe('DONE')
  })

  it('returns waiting_user if run() called without answering', async () => {
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
    rt.messages.push({ role: 'user', content: 'go', timestamp: Date.now() })

    await rt.run()
    // Call run() again without answering
    const outcome = await rt.run()
    expect(outcome).toEqual({ type: 'blocked', reason: 'waiting_user' })
  })

  it('throws when answering with no pending question', () => {
    const rt = createRuntime()
    expect(() => rt.answerPendingQuestion('hello')).toThrow('No pending question to answer')
  })

  it('executes tools before AskUserQuestion, skips tools after', async () => {
    const normalToolCall = {
      type: 'toolCall',
      id: 'tc-normal',
      name: 'bash',
      arguments: { command: 'echo hi' },
    }

    const assistantWithBoth = makeAssistantMessage({
      content: [normalToolCall, askToolCall],
      stopReason: 'toolUse',
    })

    streamSimpleMock.mockReturnValueOnce(
      makeEventStream([
        { type: 'toolcall_end', toolCall: normalToolCall },
        { type: 'toolcall_end', toolCall: askToolCall },
        { type: 'done', message: assistantWithBoth },
      ], assistantWithBoth),
    )

    const handler = vi.fn().mockResolvedValue('done')

    const rt = new AgentRuntime({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map([['bash', handler]]),
      apiKey: 'test-key',
    })
    rt.messages.push({ role: 'user', content: 'go', timestamp: Date.now() })

    const outcome = await rt.run()

    expect(outcome).toEqual({ type: 'blocked', reason: 'waiting_user' })
    // Normal tool was executed
    expect(handler).toHaveBeenCalledOnce()
    // Messages: user + assistant + toolResult(bash) — no toolResult for AskUserQuestion yet
    expect(rt.messages).toHaveLength(3)
    expect(rt.pendingQuestion).not.toBeNull()
  })
})
