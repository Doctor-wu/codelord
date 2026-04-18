import { describe, expect, it } from 'vite-plus/test'
import { ZodError } from 'zod'

import { parseFourAxisFingerprint, ScaffoldFingerprintSchema } from '../src/index.js'
import type { FourAxisFingerprint } from '../src/index.js'

const HEX16 = 'a1b2c3d4e5f60718'

function makeValidFingerprint(): FourAxisFingerprint {
  return {
    scaffold: {
      codeGitSha: HEX16,
      systemPromptStaticHash: HEX16,
      toolRegistryHash: HEX16,
      routerRulesHash: HEX16,
      safetyPolicyHash: HEX16,
      contextStrategyHash: HEX16,
      skillSetHash: null,
      retrievalConfigHash: null,
    },
    model: {
      provider: 'anthropic',
      modelId: 'claude-opus-4-7',
      generationParams: { temperature: 0.2, maxTokens: 4096 },
      promptCachingEnabled: true,
    },
    harness: {
      adapterVersion: 'headless-cli@0.0.1',
      timeoutMs: 60_000,
      maxSteps: 50,
      retries: 0,
      mcpServerVersions: {},
      containerImageSha: null,
      externalToolVersions: {},
    },
    dataset: {
      suiteId: 'polyglot-subset-v1',
      suiteVersion: '1.0.0',
      caseIds: ['case-1', 'case-2'],
      seed: 42,
      trials: 1,
    },
  }
}

describe('parseFourAxisFingerprint', () => {
  it('accepts a complete valid fingerprint', () => {
    const fp = makeValidFingerprint()
    const parsed = parseFourAxisFingerprint(fp)
    expect(parsed).toEqual(fp)
  })

  it('rejects missing scaffold.codeGitSha with structured path', () => {
    const fp = makeValidFingerprint() as any
    delete fp.scaffold.codeGitSha
    try {
      parseFourAxisFingerprint(fp)
      throw new Error('expected throw')
    } catch (e) {
      expect(e).toBeInstanceOf(ZodError)
      const issues = (e as ZodError).issues
      expect(issues[0].path).toEqual(['scaffold', 'codeGitSha'])
    }
  })

  it('rejects non-hex systemPromptStaticHash', () => {
    const fp = makeValidFingerprint()
    fp.scaffold.systemPromptStaticHash = 'ZZZZZZZZZZZZZZZZ'
    expect(() => parseFourAxisFingerprint(fp)).toThrow(ZodError)
  })

  it('rejects negative dataset.trials', () => {
    const fp = makeValidFingerprint()
    fp.dataset.trials = -1
    expect(() => parseFourAxisFingerprint(fp)).toThrow(ZodError)
  })

  it('rejects zero dataset.trials (positive constraint)', () => {
    const fp = makeValidFingerprint()
    fp.dataset.trials = 0
    expect(() => parseFourAxisFingerprint(fp)).toThrow(ZodError)
  })

  it('accepts omitted skillSetHash and null skillSetHash', () => {
    const omitted = makeValidFingerprint() as any
    delete omitted.scaffold.skillSetHash
    expect(() => parseFourAxisFingerprint(omitted)).not.toThrow()

    const explicitNull = makeValidFingerprint()
    explicitNull.scaffold.skillSetHash = null
    expect(() => parseFourAxisFingerprint(explicitNull)).not.toThrow()
  })

  it('rejects unknown extra field on scaffold (.strict())', () => {
    const fp = makeValidFingerprint() as any
    fp.scaffold.extraField = 'nope'
    expect(() => ScaffoldFingerprintSchema.parse(fp.scaffold)).toThrow(ZodError)
  })
})
