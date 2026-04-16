import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

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

function createRuntime() {
  return new AgentRuntime({
    model: { id: 'test-model' } as never,
    systemPrompt: 'You are a test agent.',
    tools: [],
    toolHandlers: new Map(),
    apiKey: 'test-key',
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

  it('throws when runtime is constructed with duplicate final tool names', () => {
    expect(
      () =>
        new AgentRuntime({
          model: { id: 'test-model' } as never,
          systemPrompt: 'test',
          tools: [
            {
              name: ASK_USER_QUESTION_TOOL_NAME,
              description: 'duplicate control tool',
              parameters: { type: 'object', properties: {} },
            } as never,
          ],
          toolHandlers: new Map(),
          apiKey: 'test-key',
        }),
    ).toThrow(`Duplicate tool name "${ASK_USER_QUESTION_TOOL_NAME}" in runtime tool set.`)
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
        makeEventStream(
          [
            { type: 'toolcall_end', toolCall },
            { type: 'done', message: assistantWithTool },
          ],
          assistantWithTool,
        ),
      )
      .mockReturnValueOnce(makeEventStream([{ type: 'done', message: finalAssistant }], finalAssistant))

    const handler = vi.fn().mockResolvedValue({ output: 'hi\n', isError: false })

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

    streamSimpleMock.mockReturnValueOnce(makeEventStream([{ type: 'done', message: msg1 }], msg1))

    const rt = createRuntime()
    rt.messages.push({ role: 'user', content: 'Hi', timestamp: Date.now() })
    await rt.run()

    expect(rt.state).toBe('READY')

    // Enqueue works after burst completion
    rt.enqueueUserMessage('follow up')

    const msg2 = makeAssistantMessage({
      content: [{ type: 'text', text: 'still here' }],
    })
    streamSimpleMock.mockReturnValueOnce(makeEventStream([{ type: 'done', message: msg2 }], msg2))

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
      lifecycle: {
        onText: () => {
          capturedPartial = rt.partial
        },
      },
    })

    streamSimpleMock.mockReturnValueOnce(
      makeEventStream(
        [
          { type: 'text_start', contentIndex: 0 },
          { type: 'text_delta', contentIndex: 0, delta: 'Hello ' },
          { type: 'text_delta', contentIndex: 0, delta: 'world' },
          { type: 'text_end', contentIndex: 0, content: 'Hello world' },
          { type: 'done', message: assistantMessage },
        ],
        assistantMessage,
      ),
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
      async result() {
        return abortedMsg
      },
    })

    const outcome = await rt.run()

    expect(outcome).toEqual({ type: 'interrupted' })
    expect(rt.state).toBe('READY')
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
      async result() {
        return makeAssistantMessage()
      },
    })

    const outcome = await rt.run()

    expect(outcome).toEqual({ type: 'interrupted' })
    expect(rt.state).toBe('READY')
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
      makeEventStream(
        [
          { type: 'toolcall_end', toolCall },
          { type: 'toolcall_end', toolCall: toolCall2 },
          { type: 'done', message: assistantWithTools },
        ],
        assistantWithTools,
      ),
    )

    let toolCallCount = 0
    const handler = vi.fn().mockImplementation(async (_args: Record<string, unknown>) => {
      toolCallCount++
      if (toolCallCount === 1) {
        // First tool completes, but interrupt is requested during it
        rt.requestInterrupt()
      }
      return { output: `result-${toolCallCount}`, isError: false }
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

    expect(outcome).toEqual({ type: 'interrupted' })
    expect(rt.state).toBe('READY')
    expect(handler).toHaveBeenCalledTimes(1)
    // Messages: user + assistant + toolResult for first tool
    expect(rt.messages).toHaveLength(3)
  })

  it('interrupt before run starts returns blocked immediately', async () => {
    const rt = createRuntime()
    rt.messages.push({ role: 'user', content: 'Hi', timestamp: Date.now() })
    rt.requestInterrupt()

    const outcome = await rt.run()

    expect(outcome).toEqual({ type: 'interrupted' })
    expect(rt.state).toBe('READY')
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
      async result() {
        return abortedMsg
      },
    })

    const outcome1 = await rt.run()
    expect(outcome1).toEqual({ type: 'interrupted' })

    // Resume: enqueue new message and run again
    const resumeAssistant = makeAssistantMessage({
      content: [{ type: 'text', text: 'Resumed!' }],
    })
    streamSimpleMock.mockReturnValueOnce(makeEventStream([{ type: 'done', message: resumeAssistant }], resumeAssistant))

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
      toolHandlers: new Map([['x', async () => ({ output: 'ok', isError: false })]]),
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
      .mockReturnValueOnce(
        makeEventStream(
          [
            { type: 'toolcall_end', toolCall: tc },
            { type: 'done', message: toolMsg },
          ],
          toolMsg,
        ),
      )
      .mockReturnValueOnce(
        makeEventStream(
          [
            { type: 'toolcall_end', toolCall: tc },
            { type: 'done', message: toolMsg },
          ],
          toolMsg,
        ),
      )

    rt.enqueueUserMessage('go')
    const outcome1 = await rt.run()
    expect(outcome1.type).toBe('error')
    expect(rt.state).toBe('READY')

    // Re-arm: enqueue new message and run again
    const recovery = makeAssistantMessage({ content: [{ type: 'text', text: 'Recovered' }] })
    streamSimpleMock.mockReturnValueOnce(makeEventStream([{ type: 'done', message: recovery }], recovery))

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
      .mockReturnValueOnce(
        makeEventStream(
          [
            { type: 'toolcall_end', toolCall: tc },
            { type: 'done', message: toolMsg },
          ],
          toolMsg,
        ),
      )
      .mockReturnValueOnce(
        makeEventStream(
          [
            { type: 'toolcall_end', toolCall: askToolCall },
            { type: 'done', message: askMsg },
          ],
          askMsg,
        ),
      )

    const rt = new AgentRuntime({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map([['x', async () => ({ output: 'ok', isError: false })]]),
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
      async result() {
        return abortedMsg
      },
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
      async result() {
        return abortedMsg
      },
    })

    await rt.run()
    expect(rt.lastOutcome).toEqual({ type: 'interrupted' })
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
      makeEventStream(
        [
          { type: 'toolcall_end', toolCall: askToolCall },
          { type: 'done', message: assistantWithAsk },
        ],
        assistantWithAsk,
      ),
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
      makeEventStream(
        [
          { type: 'toolcall_end', toolCall: askToolCall },
          { type: 'done', message: assistantWithAsk },
        ],
        assistantWithAsk,
      ),
    )

    const rt = createRuntime()
    rt.messages.push({ role: 'user', content: 'setup db', timestamp: Date.now() })

    const outcome = await rt.run()

    expect(outcome).toEqual({ type: 'blocked', reason: 'waiting_user' })
    expect(rt.state).toBe('BLOCKED')
    expect(rt.pendingQuestion).not.toBeNull()
    expect(rt.pendingQuestion!.question).toBe('Which database should I use?')
    expect(rt.pendingQuestion!.whyAsk).toBe('The config does not specify a database engine.')
    expect(rt.pendingQuestion!.options).toEqual(['postgres', 'mysql'])
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
      makeEventStream(
        [
          { type: 'toolcall_end', toolCall: fullAskToolCall },
          { type: 'done', message: assistantWithAsk },
        ],
        assistantWithAsk,
      ),
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
      makeEventStream(
        [
          { type: 'toolcall_end', toolCall: askToolCall },
          { type: 'done', message: assistantWithAsk },
        ],
        assistantWithAsk,
      ),
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
    streamSimpleMock.mockReturnValueOnce(makeEventStream([{ type: 'done', message: resumeAssistant }], resumeAssistant))

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
      makeEventStream(
        [
          { type: 'toolcall_end', toolCall: askToolCall },
          { type: 'done', message: assistantWithAsk },
        ],
        assistantWithAsk,
      ),
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
      makeEventStream(
        [
          { type: 'toolcall_end', toolCall: normalToolCall },
          { type: 'toolcall_end', toolCall: askToolCall },
          { type: 'done', message: assistantWithBoth },
        ],
        assistantWithBoth,
      ),
    )

    const handler = vi.fn().mockResolvedValue({ output: 'done', isError: false })

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

// ---------------------------------------------------------------------------
// ToolExecutionResult structured isError semantics
// ---------------------------------------------------------------------------

describe('AgentRuntime ToolExecutionResult semantics', () => {
  afterEach(() => {
    streamSimpleMock.mockReset()
  })

  it('handler returning isError=true sets ToolResultMessage.isError=true', async () => {
    const toolCall = {
      type: 'toolCall',
      id: 'tc-err',
      name: 'file_edit',
      arguments: {},
    }
    const assistantWithTool = makeAssistantMessage({
      content: [toolCall],
      stopReason: 'toolUse',
    })
    const finalAssistant = makeAssistantMessage({
      content: [{ type: 'text', text: 'ok' }],
    })

    streamSimpleMock
      .mockReturnValueOnce(
        makeEventStream(
          [
            { type: 'toolcall_end', toolCall },
            { type: 'done', message: assistantWithTool },
          ],
          assistantWithTool,
        ),
      )
      .mockReturnValueOnce(makeEventStream([{ type: 'done', message: finalAssistant }], finalAssistant))

    const handler = vi.fn().mockResolvedValue({
      output: 'ERROR [NO_MATCH]: old_string not found',
      isError: true,
      errorCode: 'NO_MATCH',
    })

    const rt = new AgentRuntime({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map([['file_edit', handler]]),
      apiKey: 'test-key',
    })
    rt.messages.push({ role: 'user', content: 'edit', timestamp: Date.now() })

    await rt.run()

    // ToolResultMessage in history should have isError=true
    const toolResultMsg = rt.messages.find((m: any) => m.role === 'toolResult') as any
    expect(toolResultMsg.isError).toBe(true)
  })

  it('handler returning isError=false sets ToolResultMessage.isError=false', async () => {
    const toolCall = {
      type: 'toolCall',
      id: 'tc-ok',
      name: 'search',
      arguments: {},
    }
    const assistantWithTool = makeAssistantMessage({
      content: [toolCall],
      stopReason: 'toolUse',
    })
    const finalAssistant = makeAssistantMessage({
      content: [{ type: 'text', text: 'done' }],
    })

    streamSimpleMock
      .mockReturnValueOnce(
        makeEventStream(
          [
            { type: 'toolcall_end', toolCall },
            { type: 'done', message: assistantWithTool },
          ],
          assistantWithTool,
        ),
      )
      .mockReturnValueOnce(makeEventStream([{ type: 'done', message: finalAssistant }], finalAssistant))

    // "No matches found" is a successful operation, not an error
    const handler = vi.fn().mockResolvedValue({
      output: 'No matches found for: xyz',
      isError: false,
    })

    const rt = new AgentRuntime({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map([['search', handler]]),
      apiKey: 'test-key',
    })
    rt.messages.push({ role: 'user', content: 'search', timestamp: Date.now() })

    await rt.run()

    const toolResultMsg = rt.messages.find((m: any) => m.role === 'toolResult') as any
    expect(toolResultMsg.isError).toBe(false)
  })

  it('handler that throws is treated as execution error (isError=true)', async () => {
    const toolCall = {
      type: 'toolCall',
      id: 'tc-throw',
      name: 'broken',
      arguments: {},
    }
    const assistantWithTool = makeAssistantMessage({
      content: [toolCall],
      stopReason: 'toolUse',
    })
    const finalAssistant = makeAssistantMessage({
      content: [{ type: 'text', text: 'recovered' }],
    })

    streamSimpleMock
      .mockReturnValueOnce(
        makeEventStream(
          [
            { type: 'toolcall_end', toolCall },
            { type: 'done', message: assistantWithTool },
          ],
          assistantWithTool,
        ),
      )
      .mockReturnValueOnce(makeEventStream([{ type: 'done', message: finalAssistant }], finalAssistant))

    const handler = vi.fn().mockRejectedValue(new Error('internal crash'))

    const rt = new AgentRuntime({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map([['broken', handler]]),
      apiKey: 'test-key',
    })
    rt.messages.push({ role: 'user', content: 'go', timestamp: Date.now() })

    await rt.run()

    const toolResultMsg = rt.messages.find((m: any) => m.role === 'toolResult') as any
    expect(toolResultMsg.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Queue source of truth tests
// ---------------------------------------------------------------------------

describe('AgentRuntime queue (pendingInbound)', () => {
  afterEach(() => {
    streamSimpleMock.mockReset()
  })

  it('pendingInboundCount reflects enqueued messages', () => {
    const rt = createRuntime()
    expect(rt.pendingInboundCount).toBe(0)

    rt.enqueueUserMessage('first')
    expect(rt.pendingInboundCount).toBe(1)

    rt.enqueueUserMessage('second')
    expect(rt.pendingInboundCount).toBe(2)
  })

  it('pendingInboundPreviews returns user message content strings', () => {
    const rt = createRuntime()
    rt.enqueueUserMessage('hello')
    rt.enqueueUserMessage('world')

    const previews = rt.pendingInboundPreviews
    expect(previews).toEqual(['hello', 'world'])
  })

  it('pendingInboundCount drops to 0 after run() drains them', async () => {
    const assistantMessage = makeAssistantMessage({
      content: [{ type: 'text', text: 'ok' }],
    })
    streamSimpleMock.mockReturnValue(makeEventStream([{ type: 'done', message: assistantMessage }], assistantMessage))

    const rt = createRuntime()
    rt.enqueueUserMessage('test')
    expect(rt.pendingInboundCount).toBe(1)

    await rt.run()
    expect(rt.pendingInboundCount).toBe(0)
  })

  it('multiple enqueued messages are all consumed in order', async () => {
    const assistantMessage = makeAssistantMessage({
      content: [{ type: 'text', text: 'ok' }],
    })
    streamSimpleMock.mockReturnValue(makeEventStream([{ type: 'done', message: assistantMessage }], assistantMessage))

    const rt = createRuntime()
    rt.enqueueUserMessage('first')
    rt.enqueueUserMessage('second')
    rt.enqueueUserMessage('third')

    expect(rt.pendingInboundCount).toBe(3)
    expect(rt.pendingInboundPreviews).toEqual(['first', 'second', 'third'])

    await rt.run()

    // All drained into messages
    expect(rt.pendingInboundCount).toBe(0)
    const userMsgs = rt.messages.filter((m) => m.role === 'user')
    expect(userMsgs.map((m) => m.content)).toEqual(['first', 'second', 'third'])
  })

  it('enqueue during run is preserved (not lost)', async () => {
    // This tests that enqueueUserMessage can be called while run() is in progress
    // Messages enqueued during a burst are drained at burst boundaries (stop),
    // so they appear in messages after the run completes.
    const assistantMessage = makeAssistantMessage({
      content: [{ type: 'text', text: 'ok' }],
    })
    streamSimpleMock.mockReturnValue(makeEventStream([{ type: 'done', message: assistantMessage }], assistantMessage))

    const rt = createRuntime()
    rt.enqueueUserMessage('initial')

    // Start run, then enqueue more (simulating concurrent input)
    const runPromise = rt.run()

    // These arrive while run() is executing
    rt.enqueueUserMessage('queued-during-run')

    await runPromise

    // The message queued during run is drained at the stop boundary,
    // so it ends up in messages (not left in pendingInbound)
    expect(rt.pendingInboundCount).toBe(0)
    const userMsgs = rt.messages.filter((m: any) => m.role === 'user')
    expect(userMsgs.map((m: any) => m.content)).toContain('queued-during-run')
  })
})

// ---------------------------------------------------------------------------
// Usage accounting tests
// ---------------------------------------------------------------------------

describe('AgentRuntime usage accounting', () => {
  afterEach(() => {
    streamSimpleMock.mockReset()
  })

  const mockUsage = {
    input: 100,
    output: 50,
    cacheRead: 30,
    cacheWrite: 10,
    totalTokens: 190,
    cost: { input: 0.001, output: 0.002, cacheRead: 0.0003, cacheWrite: 0.0001, total: 0.0034 },
  }

  it('accumulates usage from assistant message', async () => {
    const msg = makeAssistantMessage({
      content: [{ type: 'text', text: 'hello' }],
      usage: mockUsage,
      model: 'test-model',
      provider: 'test-provider',
    })
    streamSimpleMock.mockReturnValueOnce(makeEventStream([{ type: 'done', message: msg }], msg))

    const rt = createRuntime()
    rt.enqueueUserMessage('hi')
    await rt.run()

    expect(rt.usageAggregate.input).toBe(100)
    expect(rt.usageAggregate.output).toBe(50)
    expect(rt.usageAggregate.cacheRead).toBe(30)
    expect(rt.usageAggregate.totalTokens).toBe(190)
    expect(rt.usageAggregate.llmCalls).toBe(1)
    expect(rt.usageAggregate.cost.total).toBeCloseTo(0.0034)
    expect(rt.usageAggregate.lastCall).not.toBeNull()
    expect(rt.usageAggregate.lastCall!.stopReason).toBe('stop')
  })

  it('accumulates usage across multiple bursts', async () => {
    const msg1 = makeAssistantMessage({
      content: [{ type: 'text', text: 'first' }],
      usage: mockUsage,
    })
    const msg2 = makeAssistantMessage({
      content: [{ type: 'text', text: 'second' }],
      usage: { ...mockUsage, input: 200, totalTokens: 290 },
    })

    streamSimpleMock
      .mockReturnValueOnce(makeEventStream([{ type: 'done', message: msg1 }], msg1))
      .mockReturnValueOnce(makeEventStream([{ type: 'done', message: msg2 }], msg2))

    const rt = createRuntime()
    rt.enqueueUserMessage('first')
    await rt.run()

    rt.enqueueUserMessage('second')
    await rt.run()

    expect(rt.usageAggregate.input).toBe(300)
    expect(rt.usageAggregate.output).toBe(100)
    expect(rt.usageAggregate.totalTokens).toBe(480)
    expect(rt.usageAggregate.llmCalls).toBe(2)
  })

  it('emits usage_updated lifecycle event', async () => {
    const msg = makeAssistantMessage({
      content: [{ type: 'text', text: 'hello' }],
      usage: mockUsage,
    })
    streamSimpleMock.mockReturnValueOnce(makeEventStream([{ type: 'done', message: msg }], msg))

    const lifecycleEvents: unknown[] = []
    const rt = new AgentRuntime({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map(),
      apiKey: 'test-key',
      onLifecycleEvent: (e) => lifecycleEvents.push(e),
    })
    rt.enqueueUserMessage('hi')
    await rt.run()

    const usageEvent = lifecycleEvents.find((e: any) => e.type === 'usage_updated') as any
    expect(usageEvent).toBeDefined()
    expect(usageEvent.usage.totalTokens).toBe(190)
    expect(usageEvent.usage.llmCalls).toBe(1)
  })

  it('passes sessionId and cacheRetention to streamSimple', async () => {
    const msg = makeAssistantMessage({ content: [{ type: 'text', text: 'ok' }], usage: mockUsage })
    streamSimpleMock.mockReturnValueOnce(makeEventStream([{ type: 'done', message: msg }], msg))

    const rt = new AgentRuntime({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map(),
      apiKey: 'test-key',
      sessionId: 'sess-123',
      cacheRetention: 'long',
    })
    rt.enqueueUserMessage('hi')
    await rt.run()

    expect(streamSimpleMock).toHaveBeenCalledOnce()
    const options = streamSimpleMock.mock.calls[0][2]
    expect(options.sessionId).toBe('sess-123')
    expect(options.cacheRetention).toBe('long')
  })

  it('defaults cacheRetention to short when sessionId is set', async () => {
    const msg = makeAssistantMessage({ content: [{ type: 'text', text: 'ok' }], usage: mockUsage })
    streamSimpleMock.mockReturnValueOnce(makeEventStream([{ type: 'done', message: msg }], msg))

    const rt = new AgentRuntime({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map(),
      apiKey: 'test-key',
      sessionId: 'sess-456',
    })
    rt.enqueueUserMessage('hi')
    await rt.run()

    const options = streamSimpleMock.mock.calls[0][2]
    expect(options.sessionId).toBe('sess-456')
    expect(options.cacheRetention).toBe('short')
  })

  it('usage aggregate round-trips through snapshot', async () => {
    const msg = makeAssistantMessage({
      content: [{ type: 'text', text: 'hello' }],
      usage: mockUsage,
    })
    streamSimpleMock.mockReturnValueOnce(makeEventStream([{ type: 'done', message: msg }], msg))

    const rt = createRuntime()
    rt.enqueueUserMessage('hi')
    await rt.run()

    const snapshot = rt.exportSnapshot({ sessionId: 'test', cwd: '/', provider: 'p', model: 'm' })
    expect(snapshot.usageAggregate.totalTokens).toBe(190)

    const rt2 = createRuntime()
    rt2.hydrateFromSnapshot(snapshot)
    expect(rt2.usageAggregate.totalTokens).toBe(190)
    expect(rt2.usageAggregate.llmCalls).toBe(1)

    // Continue accumulating after resume
    const msg2 = makeAssistantMessage({
      content: [{ type: 'text', text: 'more' }],
      usage: { ...mockUsage, input: 50, totalTokens: 140 },
    })
    streamSimpleMock.mockReturnValueOnce(makeEventStream([{ type: 'done', message: msg2 }], msg2))
    rt2.enqueueUserMessage('more')
    await rt2.run()

    expect(rt2.usageAggregate.totalTokens).toBe(330)
    expect(rt2.usageAggregate.llmCalls).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Lifecycle event: queue_drained
// ---------------------------------------------------------------------------

describe('AgentRuntime queue_drained lifecycle event', () => {
  afterEach(() => {
    streamSimpleMock.mockReset()
  })

  it('emits queue_drained when pending messages are injected', async () => {
    const msg = makeAssistantMessage({ content: [{ type: 'text', text: 'ok' }] })
    streamSimpleMock.mockReturnValueOnce(makeEventStream([{ type: 'done', message: msg }], msg))

    const lifecycleEvents: unknown[] = []
    const rt = new AgentRuntime({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map(),
      apiKey: 'test-key',
      onLifecycleEvent: (e) => lifecycleEvents.push(e),
    })
    rt.enqueueUserMessage('hello')
    rt.enqueueUserMessage('world')
    await rt.run()

    const drainEvents = lifecycleEvents.filter((e: any) => e.type === 'queue_drained') as any[]
    expect(drainEvents.length).toBeGreaterThanOrEqual(1)
    // First drain should have both messages
    expect(drainEvents[0].count).toBe(2)
    expect(drainEvents[0].messages).toHaveLength(2)
    expect(drainEvents[0].messages[0].content).toBe('hello')
    expect(drainEvents[0].injectedAt).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Lifecycle event: question_answered
// ---------------------------------------------------------------------------

describe('AgentRuntime question_answered lifecycle event', () => {
  afterEach(() => {
    streamSimpleMock.mockReset()
  })

  it('emits question_answered when user answers a pending question', async () => {
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
      makeEventStream(
        [
          { type: 'toolcall_end', toolCall: askToolCall },
          { type: 'done', message: assistantWithAsk },
        ],
        assistantWithAsk,
      ),
    )

    const lifecycleEvents: unknown[] = []
    const rt = new AgentRuntime({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map(),
      apiKey: 'test-key',
      onLifecycleEvent: (e) => lifecycleEvents.push(e),
    })
    rt.enqueueUserMessage('setup')
    await rt.run()

    // Answer the question
    rt.answerPendingQuestion('postgres')

    const answered = lifecycleEvents.filter((e: any) => e.type === 'question_answered') as any[]
    expect(answered).toHaveLength(1)
    expect(answered[0].question).toBe('Which DB?')
    expect(answered[0].answer).toBe('postgres')
    expect(answered[0].askedAt).toBeGreaterThan(0)
    expect(answered[0].answeredAt).toBeGreaterThanOrEqual(answered[0].askedAt)
  })

  it('PendingQuestion has askedAt timestamp', async () => {
    const askToolCall = {
      type: 'toolCall',
      id: 'tc-ask',
      name: ASK_USER_QUESTION_TOOL_NAME,
      arguments: { question: 'Which?', why_ask: 'Need' },
    }
    const assistantWithAsk = makeAssistantMessage({
      content: [askToolCall],
      stopReason: 'toolUse',
    })

    streamSimpleMock.mockReturnValueOnce(
      makeEventStream(
        [
          { type: 'toolcall_end', toolCall: askToolCall },
          { type: 'done', message: assistantWithAsk },
        ],
        assistantWithAsk,
      ),
    )

    const rt = new AgentRuntime({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map(),
      apiKey: 'test-key',
    })
    rt.enqueueUserMessage('go')
    await rt.run()

    expect(rt.pendingQuestion).not.toBeNull()
    expect(rt.pendingQuestion!.askedAt).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Lifecycle callbacks tests
// ---------------------------------------------------------------------------

describe('AgentRuntime lifecycle callbacks', () => {
  afterEach(() => {
    streamSimpleMock.mockReset()
  })

  it('onStart is called at the beginning of each turn', async () => {
    const starts: unknown[] = []
    const rt = new AgentRuntime({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map(),
      apiKey: 'test-key',
      lifecycle: {
        onStart: (e) => starts.push(e),
      },
    })

    const msg = makeAssistantMessage({ content: [{ type: 'text', text: 'hi' }] })
    streamSimpleMock.mockReturnValueOnce(makeEventStream([{ type: 'done', message: msg }], msg))

    rt.enqueueUserMessage('hello')
    await rt.run()

    expect(starts).toHaveLength(1)
    expect((starts[0] as any).turnId).toMatch(/^assistant-/)
    expect((starts[0] as any).timestamp).toBeGreaterThan(0)
  })

  it('onText fires and pipeable receives deltas + final value', async () => {
    const textEvents: unknown[] = []
    const deltas: string[] = []
    let finalText: string | null = null

    const rt = new AgentRuntime({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map(),
      apiKey: 'test-key',
      lifecycle: {
        onText: (e) => {
          textEvents.push(e)
          e.pipeable.subscribe((d) => deltas.push(d))
          e.pipeable.done().then((v) => {
            finalText = v
          })
        },
      },
    })

    const assistantMessage = makeAssistantMessage({
      content: [{ type: 'text', text: 'Hello world' }],
    })
    streamSimpleMock.mockReturnValueOnce(
      makeEventStream(
        [
          { type: 'text_start', contentIndex: 0 },
          { type: 'text_delta', contentIndex: 0, delta: 'Hello ' },
          { type: 'text_delta', contentIndex: 0, delta: 'world' },
          { type: 'text_end', contentIndex: 0, content: 'Hello world' },
          { type: 'done', message: assistantMessage },
        ],
        assistantMessage,
      ),
    )

    rt.enqueueUserMessage('hi')
    await rt.run()

    expect(textEvents).toHaveLength(1)
    expect(deltas).toEqual(['Hello ', 'world'])
    // Allow microtask to resolve
    await new Promise((r) => setTimeout(r, 0))
    expect(finalText).toBe('Hello world')
  })

  it('onThinking fires and pipeable receives deltas + final value', async () => {
    const thinkingEvents: unknown[] = []
    const deltas: string[] = []
    let finalThought: string | null = null

    const rt = new AgentRuntime({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map(),
      apiKey: 'test-key',
      lifecycle: {
        onThinking: (e) => {
          thinkingEvents.push(e)
          e.pipeable.subscribe((d) => deltas.push(d))
          e.pipeable.done().then((v) => {
            finalThought = v
          })
        },
      },
    })

    const assistantMessage = makeAssistantMessage({
      content: [{ type: 'text', text: 'ok' }],
    })
    streamSimpleMock.mockReturnValueOnce(
      makeEventStream(
        [
          { type: 'thinking_start', contentIndex: 0 },
          { type: 'thinking_delta', contentIndex: 0, delta: 'Let me ' },
          { type: 'thinking_delta', contentIndex: 0, delta: 'think...' },
          { type: 'thinking_end', contentIndex: 0, content: 'Let me think...' },
          { type: 'done', message: assistantMessage },
        ],
        assistantMessage,
      ),
    )

    rt.enqueueUserMessage('hi')
    await rt.run()

    expect(thinkingEvents).toHaveLength(1)
    expect(deltas).toEqual(['Let me ', 'think...'])
    await new Promise((r) => setTimeout(r, 0))
    expect(finalThought).toBe('Let me think...')
  })

  it('onToolCall fires at toolcall_start and pipeable receives streaming_args, id_resolved, phase_change, and final lifecycle', async () => {
    const toolCallEvents: unknown[] = []
    const toolDeltas: unknown[] = []
    let finalLifecycle: unknown = null

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
        makeEventStream(
          [
            {
              type: 'toolcall_start',
              contentIndex: 0,
              partial: { content: [{ type: 'toolCall', name: 'bash', arguments: { command: 'echo' } }] },
            },
            {
              type: 'toolcall_delta',
              contentIndex: 0,
              partial: { content: [{ type: 'toolCall', name: 'bash', arguments: { command: 'echo hi' } }] },
            },
            { type: 'toolcall_end', contentIndex: 0, toolCall },
            { type: 'done', message: assistantWithTool },
          ],
          assistantWithTool,
        ),
      )
      .mockReturnValueOnce(makeEventStream([{ type: 'done', message: finalAssistant }], finalAssistant))

    const handler = vi.fn().mockResolvedValue({ output: 'hi\n', isError: false })

    const rt = new AgentRuntime({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map([['bash', handler]]),
      apiKey: 'test-key',
      lifecycle: {
        onToolCall: (e) => {
          toolCallEvents.push(e)
          e.pipeable.subscribe((d) => toolDeltas.push(d))
          e.pipeable.done().then((v) => {
            finalLifecycle = v
          })
        },
      },
    })

    rt.enqueueUserMessage('run echo')
    await rt.run()

    expect(toolCallEvents).toHaveLength(1)
    expect((toolCallEvents[0] as any).toolName).toBe('bash')

    // Should have streaming_args, id_resolved, safety, phase_change(checked), phase_change(executing), complete
    const deltaTypes = toolDeltas.map((d: any) => d.type)
    expect(deltaTypes).toContain('streaming_args')
    expect(deltaTypes).toContain('id_resolved')
    expect(deltaTypes).toContain('phase_change')

    await new Promise((r) => setTimeout(r, 0))
    expect(finalLifecycle).not.toBeNull()
    expect((finalLifecycle as any).phase).toBe('completed')
    expect((finalLifecycle as any).result).toBe('hi\n')
  })

  it('onDone is called on successful completion', async () => {
    const doneEvents: unknown[] = []
    const rt = new AgentRuntime({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map(),
      apiKey: 'test-key',
      lifecycle: {
        onDone: (e) => doneEvents.push(e),
      },
    })

    const msg = makeAssistantMessage({ content: [{ type: 'text', text: 'bye' }] })
    streamSimpleMock.mockReturnValueOnce(makeEventStream([{ type: 'done', message: msg }], msg))

    rt.enqueueUserMessage('hi')
    await rt.run()

    expect(doneEvents).toHaveLength(1)
    expect((doneEvents[0] as any).text).toBe('bye')
  })

  it('onError is called on error outcome', async () => {
    const errorEvents: unknown[] = []
    const rt = new AgentRuntime({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map([['x', async () => ({ output: 'ok', isError: false })]]),
      apiKey: 'test-key',
      maxSteps: 1,
      lifecycle: {
        onError: (e) => errorEvents.push(e),
      },
    })

    const toolMsg = makeAssistantMessage({
      content: [{ type: 'toolCall', id: 'tc', name: 'x', arguments: {} }],
      stopReason: 'toolUse',
    })
    const tc = { type: 'toolCall', id: 'tc', name: 'x', arguments: {} }

    streamSimpleMock
      .mockReturnValueOnce(
        makeEventStream(
          [
            { type: 'toolcall_end', toolCall: tc },
            { type: 'done', message: toolMsg },
          ],
          toolMsg,
        ),
      )
      .mockReturnValueOnce(
        makeEventStream(
          [
            { type: 'toolcall_end', toolCall: tc },
            { type: 'done', message: toolMsg },
          ],
          toolMsg,
        ),
      )

    rt.enqueueUserMessage('go')
    await rt.run()

    expect(errorEvents).toHaveLength(1)
    expect((errorEvents[0] as any).error).toContain('Max steps')
  })

  it('onAbort is called on interrupt and active pipeables are errored', async () => {
    const abortEvents: unknown[] = []
    let textPipeableError: Error | null = null

    const abortedMsg = makeAssistantMessage({
      stopReason: 'aborted',
      errorMessage: 'Request aborted',
    })

    const rt = new AgentRuntime({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map(),
      apiKey: 'test-key',
      lifecycle: {
        onAbort: (e) => abortEvents.push(e),
        onText: (e) => {
          e.pipeable.done().catch((err) => {
            textPipeableError = err
          })
        },
      },
    })

    streamSimpleMock.mockReturnValueOnce({
      async *[Symbol.asyncIterator]() {
        yield { type: 'text_start', contentIndex: 0 }
        yield { type: 'text_delta', contentIndex: 0, delta: 'partial' }
        rt.requestInterrupt()
        yield { type: 'error', error: abortedMsg }
      },
      async result() {
        return abortedMsg
      },
    })

    rt.enqueueUserMessage('hi')
    await rt.run()

    expect(abortEvents).toHaveLength(1)
    expect((abortEvents[0] as any).reason).toBe('interrupted')

    // The text pipeable should have been errored
    await new Promise((r) => setTimeout(r, 0))
    expect(textPipeableError).not.toBeNull()
    expect(textPipeableError!.message).toContain('interrupted')
  })
})
