import { describe, expect, it, vi, afterEach } from 'vitest'

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

import { runHeadless } from '../src/cli/headless.js'
import type { CodelordConfig } from '@codelord/config'

function makeAssistantMessage(text = 'Hello!') {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    stopReason: 'stop',
    timestamp: Date.now(),
  }
}

function makeEventStream(text = 'Hello!') {
  const msg = makeAssistantMessage(text)
  return {
    async *[Symbol.asyncIterator]() {
      yield { type: 'text_start', contentIndex: 0 }
      yield { type: 'text_delta', contentIndex: 0, delta: text }
      yield { type: 'text_end', contentIndex: 0, content: text }
    },
    async result() {
      return msg
    },
  }
}

const testConfig: CodelordConfig = {
  provider: 'anthropic',
  model: 'test-model',
  apiKey: 'test-key',
  maxSteps: 5,
  reasoningLevel: 'off',
  bash: { timeout: 5000, maxOutput: 1000 },
}

describe('runHeadless', () => {
  afterEach(() => {
    streamSimpleMock.mockReset()
    delete process.env.ANTHROPIC_AUTH_TOKEN
  })

  it('returns outcome, trace, text, and duration', async () => {
    streamSimpleMock.mockReturnValue(makeEventStream('The answer is 2.'))

    const result = await runHeadless({
      model: { id: 'test-model' } as never,
      apiKey: 'test-key',
      config: testConfig,
      prompt: 'what is 1+1',
    })

    expect(result.outcome.type).toBe('success')
    expect(result.text).toBe('The answer is 2.')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(result.trace).toBeDefined()
    expect(result.toolStats).toBeDefined()
  })

  it('trace has valid structure', async () => {
    streamSimpleMock.mockReturnValue(makeEventStream('ok'))

    const result = await runHeadless({
      model: { id: 'test-model' } as never,
      apiKey: 'test-key',
      config: testConfig,
      prompt: 'test',
    })

    const trace = result.trace
    expect(trace.version).toBe(2)
    expect(trace.runId).toBeTruthy()
    expect(trace.startedAt).toBeGreaterThan(0)
    expect(trace.endedAt).toBeGreaterThanOrEqual(trace.startedAt)
    expect(trace.steps).toBeInstanceOf(Array)
    expect(trace.eventCounts).toBeDefined()
    expect(trace.usageSummary).toBeDefined()
  })

  it('toolStats is included in result', async () => {
    streamSimpleMock.mockReturnValue(makeEventStream('done'))

    const result = await runHeadless({
      model: { id: 'test-model' } as never,
      apiKey: 'test-key',
      config: testConfig,
      prompt: 'test',
    })

    expect(result.toolStats).toHaveProperty('tools')
    expect(result.toolStats).toHaveProperty('routes')
  })

  it('returns empty text on error outcome', async () => {
    streamSimpleMock.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'error',
          error: { errorMessage: 'API error', stopReason: 'error' },
        }
      },
      async result() {
        return { role: 'assistant', content: [], stopReason: 'error', errorMessage: 'API error', timestamp: Date.now() }
      },
    })

    const result = await runHeadless({
      model: { id: 'test-model' } as never,
      apiKey: 'test-key',
      config: testConfig,
      prompt: 'test',
    })

    expect(result.outcome.type).toBe('error')
    expect(result.text).toBe('')
  })

  it('isolates Anthropic auth token env when using an explicit API key', async () => {
    process.env.ANTHROPIC_AUTH_TOKEN = 'env-oauth-token'

    streamSimpleMock.mockImplementation(() => {
      expect(process.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
      return makeEventStream('ok')
    })

    const result = await runHeadless({
      model: { id: 'test-model' } as never,
      apiKey: 'test-key',
      config: testConfig,
      prompt: 'test',
    })

    expect(result.outcome.type).toBe('success')
    expect(process.env.ANTHROPIC_AUTH_TOKEN).toBe('env-oauth-token')
  })

  it('sends AskUserQuestion only once in the tool list', async () => {
    streamSimpleMock.mockImplementation((_model, context) => {
      const names = context.tools.map((tool: { name: string }) => tool.name)
      expect(names.filter((name: string) => name === 'AskUserQuestion')).toHaveLength(1)
      return makeEventStream('ok')
    })

    const result = await runHeadless({
      model: { id: 'test-model' } as never,
      apiKey: 'test-key',
      config: testConfig,
      prompt: 'test',
    })

    expect(result.outcome.type).toBe('success')
  })
})
