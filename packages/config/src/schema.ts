import { getOAuthProvider } from '@mariozechner/pi-ai/oauth'

// ---------------------------------------------------------------------------
// Configuration type definitions & defaults
// ---------------------------------------------------------------------------

export interface BashConfig {
  /** Bash command timeout in milliseconds. */
  timeout: number
  /** Max output characters before truncation. */
  maxOutput: number
}

export interface CodelordConfig {
  /** pi-ai provider name, e.g. "anthropic", "openai", "openai-codex". */
  provider: string
  /** Model name, e.g. "claude-sonnet-4-20250514", "gpt-5.4". */
  model: string
  /** API key for the chosen provider. */
  apiKey: string
  /** Max steps per agent run. */
  maxSteps: number
  /** Bash tool configuration. */
  bash: BashConfig
}

export const DEFAULT_CONFIG: CodelordConfig = {
  provider: 'openai-codex',
  model: 'gpt-5.4',
  apiKey: '',
  maxSteps: 100,
  bash: {
    timeout: 30_000,
    maxOutput: 10_000,
  },
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateConfig(config: CodelordConfig): void {
  if (getOAuthProvider(config.provider)) {
    return
  }

  if (!config.apiKey) {
    throw new Error(
      `Missing API key for provider "${config.provider}". ` +
      'Please set CODELORD_API_KEY, a provider-specific environment variable supported by pi-ai, ' +
      'or configure apiKey in ~/.codelord/config.toml.',
    )
  }
}
