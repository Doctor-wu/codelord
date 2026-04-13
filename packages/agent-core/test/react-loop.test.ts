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

import { runAgent } from '../src/react-loop.js'
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

function makeEventStream(events, resultMessage = makeAssistantMessage()) {
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

describe('runAgent thinking support', () => {
  afterEach(() => {
    streamSimpleMock.mockReset()
  })

  it('forwards thinking and text events separately, and keeps final text from the completed assistant message', async () => {
    const assistantMessage = makeAssistantMessage({
      content: [
        { type: 'thinking', thinking: 'I should inspect the config first.' },
        { type: 'text', text: 'I checked the config and found the issue.' },
        { type: 'text', text: ' Here is the fix.' },
      ],
    })

    streamSimpleMock.mockReturnValueOnce(makeEventStream([
      { type: 'thinking_start', contentIndex: 0 },
      { type: 'thinking_delta', contentIndex: 0, delta: 'I should inspect ' },
      { type: 'thinking_delta', contentIndex: 0, delta: 'the config first.' },
      { type: 'thinking_end', contentIndex: 0, content: 'I should inspect the config first.' },
      { type: 'text_start', contentIndex: 1 },
      { type: 'text_delta', contentIndex: 1, delta: 'I checked the config' },
      { type: 'text_delta', contentIndex: 1, delta: ' and found the issue.' },
      { type: 'text_end', contentIndex: 1, content: 'I checked the config and found the issue.' },
      { type: 'done', message: assistantMessage },
    ], assistantMessage))

    const result = await runAgent({
      model: { id: 'test-model' } as never,
      systemPrompt: 'You are a test agent.',
      tools: [],
      toolHandlers: new Map(),
      userMessage: 'Debug this issue',
      apiKey: 'test-key',
    })

    expect(result.type).toBe('success')
    expect(result.text).toBe('I checked the config and found the issue. Here is the fix.')
  })
})

describe('runAgent single-shot AskUserQuestion compat', () => {
  afterEach(() => {
    streamSimpleMock.mockReset()
  })

  it('returns an error when agent calls AskUserQuestion in single-shot mode', async () => {
    const askToolCall = {
      type: 'toolCall',
      id: 'tc-ask',
      name: ASK_USER_QUESTION_TOOL_NAME,
      arguments: {
        question: 'Which env?',
        why_ask: 'Not specified',
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

    const result = await runAgent({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map(),
      userMessage: 'deploy',
      apiKey: 'test-key',
    })

    expect(result.type).toBe('error')
    expect(result.error).toContain('Agent requires user input')
    expect(result.error).toContain('Which env?')
    expect(result.error).toContain('Not specified')
  })
})

describe('runAgent lifecycle callbacks passthrough', () => {
  afterEach(() => {
    streamSimpleMock.mockReset()
  })

  it('forwards lifecycle callbacks to the underlying runtime', async () => {
    const doneEvents: unknown[] = []
    const textEvents: unknown[] = []

    const assistantMessage = makeAssistantMessage({
      content: [{ type: 'text', text: 'Hello!' }],
    })

    streamSimpleMock.mockReturnValueOnce(makeEventStream([
      { type: 'text_start', contentIndex: 0 },
      { type: 'text_delta', contentIndex: 0, delta: 'Hello!' },
      { type: 'text_end', contentIndex: 0, content: 'Hello!' },
      { type: 'done', message: assistantMessage },
    ], assistantMessage))

    const result = await runAgent({
      model: { id: 'test-model' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map(),
      userMessage: 'hi',
      apiKey: 'test-key',
      lifecycle: {
        onDone: (e) => doneEvents.push(e),
        onText: (e) => textEvents.push(e),
      },
    })

    expect(result.type).toBe('success')
    expect(doneEvents).toHaveLength(1)
    expect((doneEvents[0] as any).text).toBe('Hello!')
    expect(textEvents).toHaveLength(1)
  })
})
