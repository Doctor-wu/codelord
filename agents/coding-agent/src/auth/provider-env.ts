import type { CodelordConfig } from '@codelord/config'

function isAnthropicOAuthToken(apiKey: string): boolean {
  return apiKey.includes('sk-ant-oat')
}

async function withClearedEnvVars<T>(keys: readonly string[], fn: () => Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>()

  for (const key of keys) {
    previous.set(key, process.env[key])
    delete process.env[key]
  }

  try {
    return await fn()
  } finally {
    for (const key of keys) {
      const value = previous.get(key)
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

export async function withProviderAuthEnv<T>(
  config: CodelordConfig,
  apiKey: string,
  fn: () => Promise<T>,
): Promise<T> {
  // Anthropic's SDK auto-reads ANTHROPIC_AUTH_TOKEN unless we clear it.
  // When codelord selected an explicit static API key, that env token becomes
  // a second auth mechanism and some proxies reject the request.
  if (config.provider === 'anthropic' && !isAnthropicOAuthToken(apiKey)) {
    return withClearedEnvVars(['ANTHROPIC_AUTH_TOKEN'], fn)
  }

  return fn()
}
