import type { CodelordConfig } from '@agent/config'
import { resolveStaticApiKey } from './api-key.js'
import { isOAuthProvider, resolveOAuthApiKey } from './oauth.js'

// ---------------------------------------------------------------------------
// Unified auth entry point — dispatches by provider
// ---------------------------------------------------------------------------

/**
 * Resolve API key for the given config.
 *
 * - API key providers (anthropic, openai, ...): return config.apiKey directly.
 * - OAuth providers: run OAuth login/refresh flow.
 */
export async function resolveApiKey(config: CodelordConfig): Promise<string> {
  if (isOAuthProvider(config.provider)) {
    return resolveOAuthApiKey(config.provider)
  }
  return resolveStaticApiKey(config)
}
