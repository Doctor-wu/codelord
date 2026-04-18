import { describe, expect, it } from 'vite-plus/test'
import { ContextStrategy, ToolRegistry, ToolRouter, ToolSafetyPolicy } from '@codelord/core'
import type { ToolContract } from '@codelord/core'
import { ScaffoldFingerprintSchema } from '@codelord/evals-shared'

import { buildScaffoldFingerprint } from './scaffold-fingerprint.js'

function makeContract(name: string, whenToUse: string[] = ['use it']): ToolContract {
  return {
    toolName: name,
    whenToUse,
    whenNotToUse: [],
    preconditions: [],
    failureSemantics: [],
    fallbackHints: [],
  }
}

function makeBaseInput() {
  const contracts: ToolContract[] = [makeContract('file_read'), makeContract('search')]
  const tools = [{ name: 'file_read' }, { name: 'search' }]
  const toolRegistry = new ToolRegistry({ tools, contracts })
  const router = new ToolRouter(contracts)
  const safetyPolicy = new ToolSafetyPolicy({ cwd: '/tmp/proj' })
  const contextStrategy = new ContextStrategy()
  return { toolRegistry, router, safetyPolicy, contextStrategy }
}

describe('buildScaffoldFingerprint', () => {
  it('returns a schema-valid ScaffoldFingerprint', () => {
    const fp = buildScaffoldFingerprint(makeBaseInput())
    expect(() => ScaffoldFingerprintSchema.parse(fp)).not.toThrow()
  })

  it('is stable: two calls with identical inputs return identical hashes', () => {
    const a = buildScaffoldFingerprint(makeBaseInput())
    const b = buildScaffoldFingerprint(makeBaseInput())
    expect(a).toEqual(b)
  })

  it('changing the ToolRegistry only moves toolRegistryHash', () => {
    const base = makeBaseInput()
    const fpA = buildScaffoldFingerprint(base)

    const altContracts: ToolContract[] = [makeContract('file_read', ['different intent']), makeContract('search')]
    const altRegistry = new ToolRegistry({
      tools: [{ name: 'file_read' }, { name: 'search' }],
      contracts: altContracts,
    })
    const fpB = buildScaffoldFingerprint({ ...base, toolRegistry: altRegistry })

    expect(fpB.toolRegistryHash).not.toBe(fpA.toolRegistryHash)
    expect(fpB.systemPromptStaticHash).toBe(fpA.systemPromptStaticHash)
    expect(fpB.routerRulesHash).toBe(fpA.routerRulesHash)
    expect(fpB.safetyPolicyHash).toBe(fpA.safetyPolicyHash)
    expect(fpB.contextStrategyHash).toBe(fpA.contextStrategyHash)
  })

  it('SafetyPolicy fingerprint is independent of cwd (HOME normalization invariant)', () => {
    const base = makeBaseInput()
    const fpA = buildScaffoldFingerprint(base)

    const altSafety = new ToolSafetyPolicy({ cwd: '/var/wholly/different' })
    const fpB = buildScaffoldFingerprint({ ...base, safetyPolicy: altSafety })

    expect(fpB.safetyPolicyHash).toBe(fpA.safetyPolicyHash)
    expect(fpB.systemPromptStaticHash).toBe(fpA.systemPromptStaticHash)
    expect(fpB.toolRegistryHash).toBe(fpA.toolRegistryHash)
    expect(fpB.routerRulesHash).toBe(fpA.routerRulesHash)
    expect(fpB.contextStrategyHash).toBe(fpA.contextStrategyHash)
  })

  it('ContextStrategy config change moves only contextStrategyHash', () => {
    const base = makeBaseInput()
    const fpA = buildScaffoldFingerprint(base)

    const altContext = new ContextStrategy({ maxTokens: 64_000, reservedOutputTokens: 2048 })
    const fpB = buildScaffoldFingerprint({ ...base, contextStrategy: altContext })

    expect(fpB.contextStrategyHash).not.toBe(fpA.contextStrategyHash)
    expect(fpB.systemPromptStaticHash).toBe(fpA.systemPromptStaticHash)
    expect(fpB.toolRegistryHash).toBe(fpA.toolRegistryHash)
    expect(fpB.routerRulesHash).toBe(fpA.routerRulesHash)
    expect(fpB.safetyPolicyHash).toBe(fpA.safetyPolicyHash)
  })
})
