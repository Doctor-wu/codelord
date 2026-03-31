import type { CodelordConfig } from '@agent/config'
import { resolveStaticApiKey } from './api-key.js'
import { resolveCodexOAuth } from './oauth-codex.js'

// ---------------------------------------------------------------------------
// Unified auth entry point — dispatches by provider
// ---------------------------------------------------------------------------

/** Providers that use OAuth instead of static API keys. */
const OAUTH_PROVIDERS = new Set(['openai-codex'])

/**
 * Resolve API key for the given config.
 *
 * - API key providers (anthropic, openai, ...): return config.apiKey directly.
 * - OAuth providers (openai-codex): run OAuth login/refresh flow.
 */
export async function resolveApiKey(config: CodelordConfig): Promise<string> {
  if (OAUTH_PROVIDERS.has(config.provider)) {
    return resolveCodexOAuth()
  }
  return resolveStaticApiKey(config)
}
