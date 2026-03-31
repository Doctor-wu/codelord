import { describe, expect, it } from 'vitest'
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
})
