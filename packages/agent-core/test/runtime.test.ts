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
    expect(rt.state).toBe('READY')
    expect(rt.burstStepCount).toBe(1)
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
    expect(rt.state).toBe('READY')
    expect(rt.burstStepCount).toBe(2)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('allows enqueue and next turn after burst completion', async () => {
    const msg1 = makeAssistantMessage({
      content: [{ type: 'text', text: 'bye' }],
    })

    streamSimpleMock.mockReturnValueOnce(
      makeEventStream([{ type: 'done', message: msg1 }], msg1),
    )

    const rt = createRuntime()
    rt.messages.push({ role: 'user', content: 'Hi', timestamp: Date.now() })
    await rt.run()

    expect(rt.state).toBe('READY')

    // Enqueue works after burst completion
    rt.enqueueUserMessage('follow up')

    const msg2 = makeAssistantMessage({
      content: [{ type: 'text', text: 'still here' }],
    })
    streamSimpleMock.mockReturnValueOnce(
      makeEventStream([{ type: 'done', message: msg2 }], msg2),
    )

    const outcome = await rt.run()
    expect(outcome).toEqual({ type: 'success', text: 'still here' })
    // All messages accumulated on the same runtime
    expect(rt.messages).toHaveLength(4) // user + assistant + user + assistant
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
    expect(rt.state).toBe('READY')
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
// Re-arm / multi-turn session tests
// ---------------------------------------------------------------------------

describe('AgentRuntime multi-turn session', () => {
  afterEach(() => {
    streamSimpleMock.mockReset()
  })

  it('continues a multi-turn conversation on the same runtime after success', async () => {
    const msg1 = makeAssistantMessage({ content: [{ type: 'text', text: 'Turn 1' }] })
    const msg2 = makeAssistantMessage({ content: [{ type: 'text', text: 'Turn 2' }] })
    const msg3 = makeAssistantMessage({ content: [{ type: 'text', text: 'Turn 3' }] })

    streamSimpleMock
      .mockReturnValueOnce(makeEventStream([{ type: 'done', message: msg1 }], msg1))
      .mockReturnValueOnce(makeEventStream([{ type: 'done', message: msg2 }], msg2))
      .mockReturnValueOnce(makeEventStream([{ type: 'done', message: msg3 }], msg3))

    const rt = createRuntime()

    // Turn 1
    rt.enqueueUserMessage('first')
    expect(await rt.run()).toEqual({ type: 'success', text: 'Turn 1' })
    expect(rt.state).toBe('READY')

    // Turn 2 — same runtime, history accumulates
    rt.enqueueUserMessage('second')
    expect(await rt.run()).toEqual({ type: 'success', text: 'Turn 2' })
    expect(rt.messages).toHaveLength(4) // u1 + a1 + u2 + a2

    // Turn 3
    rt.enqueueUserMessage('third')
    expect(await rt.run()).toEqual({ type: 'success', text: 'Turn 3' })
    expect(rt.messages).toHaveLength(6) // u1 + a1 + u2 + a2 + u3 + a3
  })

  it('continues after error when new input is enqueued', async () => {
    // First run: hits max steps → ERROR (maxSteps=2, but tool loop forces 2 steps before error on 3rd)
    const rt = new AgentRuntime({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map([['x', async () => 'ok']]),
      apiKey: 'test-key',
      maxSteps: 2,
    })

    // Two rounds of tool use will exhaust maxSteps
    const toolMsg = makeAssistantMessage({
      content: [{ type: 'toolCall', id: 'tc', name: 'x', arguments: {} }],
      stopReason: 'toolUse',
    })
    const tc = { type: 'toolCall', id: 'tc', name: 'x', arguments: {} }

    streamSimpleMock
      .mockReturnValueOnce(makeEventStream([{ type: 'toolcall_end', toolCall: tc }, { type: 'done', message: toolMsg }], toolMsg))
      .mockReturnValueOnce(makeEventStream([{ type: 'toolcall_end', toolCall: tc }, { type: 'done', message: toolMsg }], toolMsg))

    rt.enqueueUserMessage('go')
    const outcome1 = await rt.run()
    expect(outcome1.type).toBe('error')
    expect(rt.state).toBe('READY')

    // Re-arm: enqueue new message and run again
    const recovery = makeAssistantMessage({ content: [{ type: 'text', text: 'Recovered' }] })
    streamSimpleMock.mockReturnValueOnce(
      makeEventStream([{ type: 'done', message: recovery }], recovery),
    )

    rt.enqueueUserMessage('try again')
    const outcome2 = await rt.run()
    expect(outcome2).toEqual({ type: 'success', text: 'Recovered' })
    expect(rt.state).toBe('READY')
  })

  it('returns pending_input (not stale outcome) when run() called without new input', async () => {
    const msg = makeAssistantMessage({ content: [{ type: 'text', text: 'done' }] })
    streamSimpleMock.mockReturnValueOnce(makeEventStream([{ type: 'done', message: msg }], msg))

    const rt = createRuntime()
    rt.enqueueUserMessage('hi')
    await rt.run()

    // No new input — returns pending_input, not stale success
    const outcome = await rt.run()
    expect(outcome).toEqual({ type: 'blocked', reason: 'pending_input' })
    // lastOutcome still records the previous burst result
    expect(rt.lastOutcome).toEqual({ type: 'success', text: 'done' })
  })
})

// ---------------------------------------------------------------------------
// Per-burst step budget tests
// ---------------------------------------------------------------------------

describe('AgentRuntime per-burst step budget', () => {
  afterEach(() => {
    streamSimpleMock.mockReset()
  })

  it('resets burstStepCount on each new turn', async () => {
    const msg1 = makeAssistantMessage({ content: [{ type: 'text', text: 'T1' }] })
    const msg2 = makeAssistantMessage({ content: [{ type: 'text', text: 'T2' }] })

    streamSimpleMock
      .mockReturnValueOnce(makeEventStream([{ type: 'done', message: msg1 }], msg1))
      .mockReturnValueOnce(makeEventStream([{ type: 'done', message: msg2 }], msg2))

    const rt = createRuntime()

    rt.enqueueUserMessage('first')
    await rt.run()
    expect(rt.burstStepCount).toBe(1)
    expect(rt.sessionStepCount).toBe(1)

    rt.enqueueUserMessage('second')
    await rt.run()
    // Burst resets, session accumulates
    expect(rt.burstStepCount).toBe(1)
    expect(rt.sessionStepCount).toBe(2)
  })

  it('resets burstStepCount when resuming from waiting_user', async () => {
    const askToolCall = {
      type: 'toolCall',
      id: 'tc-ask',
      name: ASK_USER_QUESTION_TOOL_NAME,
      arguments: { question: 'Which?', why_ask: 'Need to know' },
    }

    // Burst 1: 2 steps of tool use, then AskUserQuestion on step 3
    const toolMsg = makeAssistantMessage({
      content: [{ type: 'toolCall', id: 'tc', name: 'x', arguments: {} }],
      stopReason: 'toolUse',
    })
    const tc = { type: 'toolCall', id: 'tc', name: 'x', arguments: {} }
    const askMsg = makeAssistantMessage({
      content: [askToolCall],
      stopReason: 'toolUse',
    })

    streamSimpleMock
      .mockReturnValueOnce(makeEventStream([{ type: 'toolcall_end', toolCall: tc }, { type: 'done', message: toolMsg }], toolMsg))
      .mockReturnValueOnce(makeEventStream([{ type: 'toolcall_end', toolCall: askToolCall }, { type: 'done', message: askMsg }], askMsg))

    const rt = new AgentRuntime({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map([['x', async () => 'ok']]),
      apiKey: 'test-key',
      maxSteps: 3,
    })

    rt.enqueueUserMessage('go')
    const outcome1 = await rt.run()
    expect(outcome1).toEqual({ type: 'blocked', reason: 'waiting_user' })
    expect(rt.burstStepCount).toBe(2) // 2 steps consumed before blocking

    // Answer and resume — new burst gets fresh budget
    rt.answerPendingQuestion('postgres')

    const resumeMsg = makeAssistantMessage({ content: [{ type: 'text', text: 'ok' }] })
    streamSimpleMock.mockReturnValueOnce(makeEventStream([{ type: 'done', message: resumeMsg }], resumeMsg))

    const outcome2 = await rt.run()
    expect(outcome2).toEqual({ type: 'success', text: 'ok' })
    // Burst reset: only 1 step in this burst, not 3
    expect(rt.burstStepCount).toBe(1)
    expect(rt.sessionStepCount).toBe(3) // cumulative
  })

  it('resets burstStepCount when resuming from interrupted', async () => {
    const abortedMsg = makeAssistantMessage({ stopReason: 'aborted', errorMessage: 'aborted' })

    const rt = createRuntime()
    rt.messages.push({ role: 'user', content: 'Hi', timestamp: Date.now() })

    streamSimpleMock.mockReturnValueOnce({
      async *[Symbol.asyncIterator]() {
        yield { type: 'text_delta', contentIndex: 0, delta: 'partial' }
        rt.requestInterrupt()
        yield { type: 'error', error: abortedMsg }
      },
      async result() { return abortedMsg },
    })

    await rt.run()
    expect(rt.burstStepCount).toBe(1)

    // Resume after interrupt — new burst
    const resumeMsg = makeAssistantMessage({ content: [{ type: 'text', text: 'ok' }] })
    streamSimpleMock.mockReturnValueOnce(makeEventStream([{ type: 'done', message: resumeMsg }], resumeMsg))

    rt.enqueueUserMessage('continue')
    await rt.run()
    expect(rt.burstStepCount).toBe(1) // reset, not 2
    expect(rt.sessionStepCount).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// lastOutcome recording semantics
// ---------------------------------------------------------------------------

describe('AgentRuntime lastOutcome semantics', () => {
  afterEach(() => {
    streamSimpleMock.mockReset()
  })

  it('records interrupted blocked outcome in lastOutcome (stream abort)', async () => {
    const abortedMsg = makeAssistantMessage({ stopReason: 'aborted', errorMessage: 'aborted' })

    const rt = createRuntime()
    rt.messages.push({ role: 'user', content: 'Hi', timestamp: Date.now() })

    streamSimpleMock.mockReturnValueOnce({
      async *[Symbol.asyncIterator]() {
        yield { type: 'text_delta', contentIndex: 0, delta: 'partial' }
        rt.requestInterrupt()
        yield { type: 'error', error: abortedMsg }
      },
      async result() { return abortedMsg },
    })

    await rt.run()
    expect(rt.lastOutcome).toEqual({ type: 'blocked', reason: 'interrupted' })
  })

  it('records waiting_user blocked outcome in lastOutcome', async () => {
    const askToolCall = {
      type: 'toolCall',
      id: 'tc-ask',
      name: ASK_USER_QUESTION_TOOL_NAME,
      arguments: { question: 'Which?', why_ask: 'Need to know' },
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
    rt.messages.push({ role: 'user', content: 'go', timestamp: Date.now() })
    await rt.run()

    expect(rt.lastOutcome).toEqual({ type: 'blocked', reason: 'waiting_user' })
  })

  it('READY no-input does not overwrite lastOutcome', async () => {
    const msg = makeAssistantMessage({ content: [{ type: 'text', text: 'done' }] })
    streamSimpleMock.mockReturnValueOnce(makeEventStream([{ type: 'done', message: msg }], msg))

    const rt = createRuntime()
    rt.enqueueUserMessage('hi')
    await rt.run()
    expect(rt.lastOutcome).toEqual({ type: 'success', text: 'done' })

    // No-op call — should not overwrite
    const noWork = await rt.run()
    expect(noWork).toEqual({ type: 'blocked', reason: 'pending_input' })
    // lastOutcome still reflects the real burst
    expect(rt.lastOutcome).toEqual({ type: 'success', text: 'done' })
  })

  it('IDLE no-input returns pending_input without calling streamSimple', async () => {
    const rt = createRuntime()

    const outcome = await rt.run()
    expect(outcome).toEqual({ type: 'blocked', reason: 'pending_input' })
    expect(rt.state).toBe('IDLE')
    expect(rt.lastOutcome).toBeNull()
    expect(streamSimpleMock).not.toHaveBeenCalled()
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
    expect(rt.state).toBe('READY')
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
