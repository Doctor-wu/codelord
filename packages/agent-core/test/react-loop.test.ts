import { afterEach, describe, expect, it, vi } from 'vitest'

const { streamSimpleMock } = vi.hoisted(() => ({
  streamSimpleMock: vi.fn(),
}))

vi.mock('@mariozechner/pi-ai', () => ({
  streamSimple: streamSimpleMock,
}))

import { runAgent } from '../src/react-loop.js'

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

    const events = []

    const result = await runAgent({
      model: { id: 'test-model' } as never,
      systemPrompt: 'You are a test agent.',
      tools: [],
      toolHandlers: new Map(),
      userMessage: 'Debug this issue',
      apiKey: 'test-key',
      onEvent: (event) => events.push(event),
    })

    expect(result.type).toBe('success')
    expect(result.text).toBe('I checked the config and found the issue. Here is the fix.')
    expect(events.map((event) => event.type)).toEqual([
      'step_start',
      'thinking_start',
      'thinking_delta',
      'thinking_delta',
      'thinking_end',
      'text_start',
      'text_delta',
      'text_delta',
      'text_end',
      'done',
    ])
  })
})
