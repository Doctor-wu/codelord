// ---------------------------------------------------------------------------
// Context Window Management — token estimation, truncation, and the
// ContextStrategy carrier (used by AgentRuntime + scaffold fingerprint).
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto'
import type { Message } from '@mariozechner/pi-ai'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ContextWindowConfig {
  maxTokens: number
  reservedOutputTokens: number
}

export const DEFAULT_CONTEXT_WINDOW: ContextWindowConfig = {
  maxTokens: 128_000,
  reservedOutputTokens: 4096,
}

/** Bump when truncation algorithm semantics change. */
export const CONTEXT_STRATEGY_VERSION = 'v1'

// ---------------------------------------------------------------------------
// Token estimation (chars / 4 — intentionally coarse)
// ---------------------------------------------------------------------------

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function estimateMessageTokens(msg: Message): number {
  const ROLE_OVERHEAD = 4
  const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
  return ROLE_OVERHEAD + estimateTokens(content)
}

// ---------------------------------------------------------------------------
// Truncation result
// ---------------------------------------------------------------------------

export interface TruncationResult {
  messages: Message[]
  wasTruncated: boolean
  droppedCount: number
  droppedTokens: number
  budget: {
    total: number
    systemPrompt: number
    tools: number
    reserved: number
    availableForMessages: number
    messagesBeforeTruncation: number
    messagesAfterTruncation: number
  }
}

// ---------------------------------------------------------------------------
// Core truncation logic
// ---------------------------------------------------------------------------

const MIN_KEEP = 4

function truncateImpl(
  messages: Message[],
  systemPromptTokens: number,
  toolsTokens: number,
  config: ContextWindowConfig,
): TruncationResult {
  const available = config.maxTokens - systemPromptTokens - toolsTokens - config.reservedOutputTokens

  const perMsg = messages.map(estimateMessageTokens)
  const totalTokens = perMsg.reduce((a, b) => a + b, 0)

  const budget = {
    total: config.maxTokens,
    systemPrompt: systemPromptTokens,
    tools: toolsTokens,
    reserved: config.reservedOutputTokens,
    availableForMessages: available,
    messagesBeforeTruncation: messages.length,
    messagesAfterTruncation: messages.length,
  }

  if (totalTokens <= available) {
    return { messages, wasTruncated: false, droppedCount: 0, droppedTokens: 0, budget }
  }

  // Drop from the oldest, but always keep the last MIN_KEEP messages
  const keepTail = Math.min(MIN_KEEP, messages.length)
  let droppedCount = 0
  let droppedTokens = 0
  let keptTokens = 0

  // Tokens in the protected tail
  for (let i = messages.length - keepTail; i < messages.length; i++) {
    keptTokens += perMsg[i]
  }

  // Walk from oldest, dropping until we fit
  const kept: Message[] = []
  for (let i = 0; i < messages.length - keepTail; i++) {
    if (keptTokens + perMsg[i] > available) {
      droppedCount++
      droppedTokens += perMsg[i]
    } else {
      kept.push(messages[i])
      keptTokens += perMsg[i]
    }
  }

  // Append protected tail
  for (let i = messages.length - keepTail; i < messages.length; i++) {
    kept.push(messages[i])
  }

  budget.messagesAfterTruncation = kept.length

  return { messages: kept, wasTruncated: droppedCount > 0, droppedCount, droppedTokens, budget }
}

// ---------------------------------------------------------------------------
// ContextStrategy — instance carrier for truncation + fingerprint
// ---------------------------------------------------------------------------

export class ContextStrategy {
  readonly config: ContextWindowConfig

  constructor(config: ContextWindowConfig = DEFAULT_CONTEXT_WINDOW) {
    this.config = config
  }

  truncate(messages: Message[], systemPromptTokens: number, toolsTokens: number): TruncationResult {
    return truncateImpl(messages, systemPromptTokens, toolsTokens, this.config)
  }

  /**
   * Static fingerprint — hashes the merged ContextWindowConfig + algorithm
   * version constant. Stable across runs with the same config.
   */
  fingerprint(): string {
    const input = JSON.stringify({
      maxTokens: this.config.maxTokens,
      reservedOutputTokens: this.config.reservedOutputTokens,
      version: CONTEXT_STRATEGY_VERSION,
    })
    return createHash('sha256').update(input).digest('hex').slice(0, 16)
  }
}

// ---------------------------------------------------------------------------
// Backward-compat wrapper — delegates to ContextStrategy.truncate
// ---------------------------------------------------------------------------

/** @deprecated Use ContextStrategy.truncate. Kept temporarily for back-compat. */
export function truncateMessages(
  messages: Message[],
  systemPromptTokens: number,
  toolsTokens: number,
  config: ContextWindowConfig = DEFAULT_CONTEXT_WINDOW,
): TruncationResult {
  return new ContextStrategy(config).truncate(messages, systemPromptTokens, toolsTokens)
}
