import { describe, expect, it } from 'vitest'
import type { Message } from '@mariozechner/pi-ai'
import {
  estimateTokens,
  estimateMessageTokens,
  truncateMessages,
  DEFAULT_CONTEXT_WINDOW,
} from '../src/context-window.js'
import type { ContextWindowConfig } from '../src/context-window.js'

describe('estimateTokens', () => {
  it('estimates chars/4 rounded up', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('a')).toBe(1)
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcde')).toBe(2)
    expect(estimateTokens('a'.repeat(100))).toBe(25)
  })
})

describe('estimateMessageTokens', () => {
  it('adds role overhead to string content', () => {
    const msg: Message = { role: 'user', content: 'hello' }
    // 4 (overhead) + ceil(5/4) = 4 + 2 = 6
    expect(estimateMessageTokens(msg)).toBe(6)
  })

  it('handles non-string content via JSON.stringify', () => {
    const msg: Message = { role: 'assistant', content: [{ type: 'text', text: 'hi' }] } as any
    const json = JSON.stringify(msg.content)
    expect(estimateMessageTokens(msg)).toBe(4 + Math.ceil(json.length / 4))
  })
})

describe('truncateMessages', () => {
  const makeMsg = (text: string): Message => ({ role: 'user', content: text })

  // Helper: small config for easy math
  const smallConfig: ContextWindowConfig = {
    maxTokens: 200,
    reservedOutputTokens: 20,
  }

  it('returns all messages when under budget', () => {
    const msgs = [makeMsg('hi'), makeMsg('there')]
    const result = truncateMessages(msgs, 10, 10, smallConfig)
    expect(result.wasTruncated).toBe(false)
    expect(result.messages).toBe(msgs) // same reference
    expect(result.droppedCount).toBe(0)
    expect(result.droppedTokens).toBe(0)
    expect(result.budget.messagesBeforeTruncation).toBe(2)
    expect(result.budget.messagesAfterTruncation).toBe(2)
  })

  it('drops oldest messages when over budget', () => {
    // available = 200 - 50 - 50 - 20 = 80 tokens for messages
    // Each msg with 100 chars = 4 + ceil(100/4) = 4 + 25 = 29 tokens
    // 6 msgs = 174 tokens > 80
    const msgs = Array.from({ length: 6 }, (_, i) => makeMsg('x'.repeat(100) + i))
    const result = truncateMessages(msgs, 50, 50, smallConfig)

    expect(result.wasTruncated).toBe(true)
    expect(result.droppedCount).toBeGreaterThan(0)
    expect(result.messages.length).toBeLessThan(6)
    // Last 4 always kept
    expect(result.messages.length).toBeGreaterThanOrEqual(4)
    // The last 4 original messages should be preserved
    expect(result.messages.slice(-4)).toEqual(msgs.slice(-4))
  })

  it('always preserves the last 4 messages', () => {
    // Make budget extremely tight — only room for ~1 message
    const tinyConfig: ContextWindowConfig = { maxTokens: 100, reservedOutputTokens: 10 }
    const msgs = Array.from({ length: 8 }, (_, i) => makeMsg(`msg-${i}`))
    const result = truncateMessages(msgs, 30, 30, tinyConfig)

    // available = 100 - 30 - 30 - 10 = 30
    // Even if budget is tight, last 4 are always kept
    expect(result.messages.length).toBeGreaterThanOrEqual(4)
    expect(result.messages.slice(-4)).toEqual(msgs.slice(-4))
  })

  it('budget breakdown numbers are correct', () => {
    const result = truncateMessages([], 1000, 2000, {
      maxTokens: 10000,
      reservedOutputTokens: 500,
    })
    expect(result.budget).toEqual({
      total: 10000,
      systemPrompt: 1000,
      tools: 2000,
      reserved: 500,
      availableForMessages: 6500,
      messagesBeforeTruncation: 0,
      messagesAfterTruncation: 0,
    })
  })

  it('uses DEFAULT_CONTEXT_WINDOW when no config provided', () => {
    const msgs = [makeMsg('hi')]
    const result = truncateMessages(msgs, 10, 10)
    expect(result.budget.total).toBe(DEFAULT_CONTEXT_WINDOW.maxTokens)
    expect(result.budget.reserved).toBe(DEFAULT_CONTEXT_WINDOW.reservedOutputTokens)
  })

  it('handles empty messages array', () => {
    const result = truncateMessages([], 10, 10, smallConfig)
    expect(result.wasTruncated).toBe(false)
    expect(result.messages).toEqual([])
    expect(result.droppedCount).toBe(0)
  })

  it('handles fewer than 4 messages gracefully', () => {
    const msgs = [makeMsg('a'), makeMsg('b')]
    // Make budget very tight
    const tinyConfig: ContextWindowConfig = { maxTokens: 50, reservedOutputTokens: 5 }
    const result = truncateMessages(msgs, 10, 10, tinyConfig)
    // With only 2 messages, all are in the protected tail
    expect(result.messages.length).toBe(2)
  })
})
