// ---------------------------------------------------------------------------
// Scaffold fingerprint aggregation — composes the 6 sub-hashes mandated by
// ADR-0001 §"按字段分配" into a single ScaffoldFingerprint object.
// ---------------------------------------------------------------------------

import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import type { ScaffoldFingerprint } from '@codelord/evals-shared'
import type { ContextStrategy, ToolContract, ToolRegistry, ToolRouter, ToolSafetyPolicy } from '@codelord/core'
import { buildSystemPrompt, buildSystemPromptStaticFingerprint } from './system-prompt.js'

export interface ScaffoldFingerprintInput {
  toolRegistry: ToolRegistry
  router: ToolRouter
  safetyPolicy: ToolSafetyPolicy
  contextStrategy: ContextStrategy
}

export function buildScaffoldFingerprint(input: ScaffoldFingerprintInput): ScaffoldFingerprint {
  return {
    codeGitSha: resolveCodeGitSha(),
    systemPromptStaticHash: buildSystemPromptStaticFingerprint(),
    toolRegistryHash: input.toolRegistry.fingerprint(),
    routerRulesHash: input.router.fingerprint(),
    safetyPolicyHash: input.safetyPolicy.fingerprint(),
    contextStrategyHash: input.contextStrategy.fingerprint(),
    skillSetHash: null,
    retrievalConfigHash: null,
  }
}

function resolveCodeGitSha(): string {
  const envSha = process.env.CODELORD_BUILD_SHA
  if (envSha) return envSha
  try {
    const sha = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
      .slice(0, 16)
    const dirty =
      execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim().length > 0
    return dirty ? `${sha}-dirty` : sha
  } catch {
    return 'unknown'
  }
}

// ---------------------------------------------------------------------------
// Effective prompt hash — per-run diagnostic, NOT part of the static
// scaffold fingerprint. See ADR-0001 §"effectivePromptHash".
// ---------------------------------------------------------------------------

export interface EffectivePromptInput {
  cwd: string
  contracts: readonly ToolContract[]
  gitBranch: string
  mergedConfig: unknown
}

export function computeEffectivePromptHash(input: EffectivePromptInput): string {
  const prompt = buildSystemPrompt({ cwd: input.cwd, contracts: input.contracts })
  const payload = [prompt, input.gitBranch, JSON.stringify(input.mergedConfig)].join('\n')
  return createHash('sha256').update(payload).digest('hex').slice(0, 16)
}
