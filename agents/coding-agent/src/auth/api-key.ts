import type { CodelordConfig } from '@codelord/config'

// ---------------------------------------------------------------------------
// API key strategy — for providers that use static API keys
// (anthropic, openai, etc.)
// ---------------------------------------------------------------------------

/**
 * Return the API key from config. Throws if empty (defense in depth —
 * loadConfig's validateConfig already checks this).
 */
export function resolveStaticApiKey(config: CodelordConfig): string {
  if (!config.apiKey) {
    throw new Error(
      `No API key configured for provider "${config.provider}". ` +
        'Set CODELORD_API_KEY or configure apiKey in ~/.codelord/config.toml.',
    )
  }
  return config.apiKey
}
