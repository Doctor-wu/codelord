// ---------------------------------------------------------------------------
// Model Capabilities — resolve model features from pi-ai Model object
// ---------------------------------------------------------------------------

import type { Model, Api } from '@mariozechner/pi-ai'
import type { ReasoningLevel } from './reasoning-manager.js'

export interface ModelCapabilities {
  /** Whether the model supports reasoning (from pi-ai Model.reasoning) */
  supportsReasoning: boolean
  /** Whether the provider streams thinking content (thinking_start/delta/end events) */
  supportsThinkingStream: boolean
  /** Default reasoning level when not explicitly configured */
  defaultReasoningLevel: ReasoningLevel
  /** Context window size in tokens (from pi-ai Model.contextWindow) */
  maxContextTokens: number
  /** Max output tokens (from pi-ai Model.maxTokens) */
  maxOutputTokens: number
}

/**
 * Providers known to stream thinking content (thinking_start/delta/end).
 * Other providers may support reasoning as a parameter but don't stream the thinking process.
 */
const THINKING_STREAM_PROVIDERS = new Set(['anthropic', 'amazon-bedrock'])

/**
 * Resolve model capabilities directly from pi-ai Model object.
 * No hardcoded matrix needed — pi-ai already has all the data.
 * Defensive about missing fields for test models that use partial mocks.
 */
export function resolveModelCapabilities<TApi extends Api>(model: Model<TApi>): ModelCapabilities {
  const providerName = typeof model.provider === 'string' ? model.provider : String(model.provider ?? '')
  const reasoning = model.reasoning ?? false
  const contextWindow = model.contextWindow ?? 128_000
  const maxTokens = model.maxTokens ?? 4096

  return {
    supportsReasoning: reasoning,
    supportsThinkingStream: reasoning && THINKING_STREAM_PROVIDERS.has(providerName),
    defaultReasoningLevel: reasoning ? 'high' : 'off',
    maxContextTokens: contextWindow,
    maxOutputTokens: maxTokens,
  }
}
