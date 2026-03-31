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
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  apiKey: '',
  maxSteps: 10,
  bash: {
    timeout: 30_000,
    maxOutput: 10_000,
  },
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** API key environment variable fallbacks per provider. */
const PROVIDER_ENV_KEYS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  'openai-codex': 'OPENAI_API_KEY',
}

const OAUTH_PROVIDERS = new Set(['openai-codex'])

export function getProviderEnvKey(provider: string): string | undefined {
  return PROVIDER_ENV_KEYS[provider]
}

export function validateConfig(config: CodelordConfig): void {
  if (OAUTH_PROVIDERS.has(config.provider)) {
    return
  }

  if (!config.apiKey) {
    const envHint = getProviderEnvKey(config.provider)
    const envMsg = envHint
      ? `set ${envHint} (or CODELORD_API_KEY) environment variable`
      : 'set CODELORD_API_KEY environment variable'

    throw new Error(
      `Missing API key for provider "${config.provider}". ` +
      `Please ${envMsg} or configure apiKey in ~/.codelord/config.toml.`,
    )
  }
}
