import type { CodelordConfig } from './schema.js'
import { getEnvApiKey } from '@mariozechner/pi-ai'
import { DEFAULT_CONFIG, validateConfig } from './schema.js'
import { readTomlConfig } from './toml.js'

// ---------------------------------------------------------------------------
// Deep merge helper (field-level, not whole-object replacement)
// ---------------------------------------------------------------------------

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

function deepMerge<T extends object>(
  base: T,
  override: DeepPartial<T>,
): T {
  const result = { ...base }

  for (const key of Object.keys(override) as (keyof T)[]) {
    const val = override[key]
    if (val === undefined) continue

    const baseVal = base[key]
    if (
      typeof val === 'object' &&
      val !== null &&
      !Array.isArray(val) &&
      typeof baseVal === 'object' &&
      baseVal !== null
    ) {
      result[key] = deepMerge(
        baseVal as object,
        val as DeepPartial<object>,
      ) as T[keyof T]
    } else {
      result[key] = val as T[keyof T]
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Environment variable reader
// ---------------------------------------------------------------------------

function readEnvOverrides(env: Record<string, string | undefined>): DeepPartial<CodelordConfig> {
  const overrides: DeepPartial<CodelordConfig> = {}

  if (env.CODELORD_PROVIDER) overrides.provider = env.CODELORD_PROVIDER
  if (env.CODELORD_MODEL) overrides.model = env.CODELORD_MODEL
  if (env.CODELORD_API_KEY) overrides.apiKey = env.CODELORD_API_KEY
  if (env.CODELORD_MAX_STEPS) overrides.maxSteps = Number(env.CODELORD_MAX_STEPS)

  return overrides
}

/**
 * Resolve apiKey fallback: if apiKey is still empty after merge,
 * try provider-specific env var (e.g. ANTHROPIC_API_KEY).
 */
function resolveApiKeyFallback(
  config: CodelordConfig,
  env: Record<string, string | undefined>,
): CodelordConfig {
  if (config.apiKey) return config

  const envApiKey = getEnvApiKeyFromEnv(config.provider, env)
  if (envApiKey) {
    return { ...config, apiKey: envApiKey }
  }

  return config
}

function getEnvApiKeyFromEnv(
  provider: string,
  env: Record<string, string | undefined>,
): string | undefined {
  if (env === process.env) {
    return getEnvApiKey(provider)
  }

  const mergedEnv = { ...process.env, ...env }
  const touchedKeys = new Set(Object.keys(process.env))
  for (const key of Object.keys(env)) touchedKeys.add(key)

  const previous = new Map<string, string | undefined>()
  for (const key of touchedKeys) {
    previous.set(key, process.env[key])
  }

  try {
    for (const key of touchedKeys) {
      const value = mergedEnv[key]
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }

    return getEnvApiKey(provider)
  } finally {
    for (const key of touchedKeys) {
      const value = previous.get(key)
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load configuration with layered overrides:
 *   defaults → ~/.codelord/config.toml → env vars → CLI flags
 *
 * Each layer merges at field level (not whole-object replacement).
 * Throws if the final config is invalid (e.g. missing apiKey).
 */
export function loadConfig(
  cliFlags?: DeepPartial<CodelordConfig>,
  options?: { env?: Record<string, string | undefined>; tomlPath?: string },
): CodelordConfig {
  const env = options?.env ?? process.env

  // Layer 1: defaults
  let config: CodelordConfig = { ...DEFAULT_CONFIG, bash: { ...DEFAULT_CONFIG.bash } }

  // Layer 2: TOML file
  const toml = readTomlConfig(options?.tomlPath)
  if (Object.keys(toml).length > 0) {
    config = deepMerge(config, toml as DeepPartial<CodelordConfig>)
  }

  // Layer 3: environment variables
  const envOverrides = readEnvOverrides(env)
  config = deepMerge(config, envOverrides)

  // Layer 4: CLI flags
  if (cliFlags) {
    config = deepMerge(config, cliFlags)
  }

  // Resolve apiKey fallback from provider-specific env var
  config = resolveApiKeyFallback(config, env)

  // Validate
  validateConfig(config)

  return config
}
