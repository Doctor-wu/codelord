import { describe, expect, it } from 'vite-plus/test'
import { loadConfig } from '../src/load.js'

describe('loadConfig', () => {
  it('allows openai-codex without a static api key', () => {
    expect(() =>
      loadConfig(
        {
          provider: 'openai-codex',
          model: 'gpt-5.4',
        },
        {
          env: {},
          tomlPath: '/definitely/does/not/exist.toml',
        },
      ),
    ).not.toThrow()
  })

  it('uses pi-ai provider env lookup for static providers', () => {
    const config = loadConfig(
      {
        provider: 'xai',
        model: 'grok-code-fast-1',
      },
      {
        env: {
          XAI_API_KEY: 'test-xai-key',
        },
        tomlPath: '/definitely/does/not/exist.toml',
      },
    )

    expect(config.apiKey).toBe('test-xai-key')
  })
})
