import type { CodelordConfig } from '@codelord/config'
import { resolveStaticApiKey } from './api-key.js'
import { isOAuthProvider, resolveOAuthApiKey } from './oauth.js'

// ---------------------------------------------------------------------------
// Unified auth entry point — dispatches by provider
// ---------------------------------------------------------------------------

/**
 * Resolve API key for the given config.
 *
 * Priority: explicit API key (from config/env) > OAuth flow.
 * This ensures that when a user provides an API key (e.g. for a third-party proxy),
 * we use it directly without triggering OAuth, even for providers that support OAuth.
 */
export async function resolveApiKey(config: CodelordConfig): Promise<string> {
  // If an API key is explicitly configured, use it directly
  if (config.apiKey) {
    return config.apiKey
  }

  // No explicit API key — try OAuth if the provider supports it
  if (isOAuthProvider(config.provider)) {
    return resolveOAuthApiKey(config.provider)
  }

  // Neither API key nor OAuth available
  return resolveStaticApiKey(config)
}
