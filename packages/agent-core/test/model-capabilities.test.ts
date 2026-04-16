import { describe, it, expect } from 'vitest'
import { resolveModelCapabilities } from '../src/model-capabilities.js'
import type { Model, Api } from '@mariozechner/pi-ai'

function makeModel(overrides: Partial<Model<Api>> = {}): Model<Api> {
  return {
    id: 'test-model',
    name: 'Test Model',
    api: 'openai-responses' as Api,
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
    ...overrides,
  }
}

describe('resolveModelCapabilities', () => {
  it('reasoning=true model returns supportsReasoning=true', () => {
    const caps = resolveModelCapabilities(makeModel({ reasoning: true }))
    expect(caps.supportsReasoning).toBe(true)
  })

  it('reasoning=false model returns supportsReasoning=false', () => {
    const caps = resolveModelCapabilities(makeModel({ reasoning: false }))
    expect(caps.supportsReasoning).toBe(false)
  })

  it('anthropic provider returns supportsThinkingStream=true when reasoning=true', () => {
    const caps = resolveModelCapabilities(
      makeModel({
        provider: 'anthropic',
        reasoning: true,
      }),
    )
    expect(caps.supportsThinkingStream).toBe(true)
  })

  it('anthropic provider returns supportsThinkingStream=false when reasoning=false', () => {
    const caps = resolveModelCapabilities(
      makeModel({
        provider: 'anthropic',
        reasoning: false,
      }),
    )
    expect(caps.supportsThinkingStream).toBe(false)
  })

  it('openai provider returns supportsThinkingStream=false', () => {
    const caps = resolveModelCapabilities(
      makeModel({
        provider: 'openai',
        reasoning: true,
      }),
    )
    expect(caps.supportsThinkingStream).toBe(false)
  })

  it('amazon-bedrock provider returns supportsThinkingStream=true when reasoning=true', () => {
    const caps = resolveModelCapabilities(
      makeModel({
        provider: 'amazon-bedrock',
        reasoning: true,
      }),
    )
    expect(caps.supportsThinkingStream).toBe(true)
  })

  it('contextWindow is passed through', () => {
    const caps = resolveModelCapabilities(makeModel({ contextWindow: 200000 }))
    expect(caps.maxContextTokens).toBe(200000)
  })

  it('maxTokens is passed through', () => {
    const caps = resolveModelCapabilities(makeModel({ maxTokens: 8192 }))
    expect(caps.maxOutputTokens).toBe(8192)
  })

  it('defaultReasoningLevel is high when reasoning=true', () => {
    const caps = resolveModelCapabilities(makeModel({ reasoning: true }))
    expect(caps.defaultReasoningLevel).toBe('high')
  })

  it('defaultReasoningLevel is off when reasoning=false', () => {
    const caps = resolveModelCapabilities(makeModel({ reasoning: false }))
    expect(caps.defaultReasoningLevel).toBe('off')
  })

  it('works with google provider (no thinking stream)', () => {
    const caps = resolveModelCapabilities(
      makeModel({
        provider: 'google',
        reasoning: true,
        contextWindow: 1000000,
        maxTokens: 65536,
      }),
    )
    expect(caps.supportsReasoning).toBe(true)
    expect(caps.supportsThinkingStream).toBe(false)
    expect(caps.maxContextTokens).toBe(1000000)
    expect(caps.maxOutputTokens).toBe(65536)
  })
})
