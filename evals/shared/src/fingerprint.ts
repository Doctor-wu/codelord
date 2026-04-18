// ---------------------------------------------------------------------------
// Four-axis fingerprint schema (zod) — shared by runHeadless / eval adapters /
// CLI tooling. See docs/adr/0001-four-axis-fingerprint-boundary.md for the
// field-by-field semantic boundary between static and effective indicators.
// ---------------------------------------------------------------------------

import { z } from 'zod'

const shortHash = z.string().regex(/^[0-9a-f]{16}$/, '16-char hex hash required')

// codeGitSha allows a "-dirty" suffix when the working tree is dirty,
// or the literal "unknown" when git resolution failed.
const gitSha = z
  .string()
  .regex(/^[0-9a-f]{16}(-dirty)?$|^unknown$/, 'codeGitSha must be 16-char hex, optionally "-dirty", or "unknown"')

const generationParams = z
  .object({
    temperature: z.number().optional(),
    topP: z.number().optional(),
    maxTokens: z.number().int().positive().optional(),
    reasoningLevel: z.string().optional(),
  })
  .strict()

export const ScaffoldFingerprintSchema = z
  .object({
    codeGitSha: gitSha,
    systemPromptStaticHash: shortHash,
    toolRegistryHash: shortHash,
    routerRulesHash: shortHash,
    safetyPolicyHash: shortHash,
    contextStrategyHash: shortHash,
    skillSetHash: shortHash.nullable().optional(), // M4 filling
    retrievalConfigHash: shortHash.nullable().optional(), // M5 filling
  })
  .strict()

export const ModelFingerprintSchema = z
  .object({
    provider: z.string().min(1),
    modelId: z.string().min(1),
    generationParams,
    promptCachingEnabled: z.boolean(),
  })
  .strict()

export const HarnessFingerprintSchema = z
  .object({
    adapterVersion: z.string().min(1),
    timeoutMs: z.number().int().nonnegative(),
    maxSteps: z.number().int().nonnegative(),
    retries: z.number().int().nonnegative(),
    mcpServerVersions: z.record(z.string(), z.string()),
    containerImageSha: z.string().nullable(),
    externalToolVersions: z.record(z.string(), z.string()),
  })
  .strict()

export const DatasetFingerprintSchema = z
  .object({
    suiteId: z.string().min(1),
    suiteVersion: z.string().min(1),
    caseIds: z.array(z.string()),
    seed: z.number().int(),
    trials: z.number().int().positive(),
  })
  .strict()

export const FourAxisFingerprintSchema = z
  .object({
    scaffold: ScaffoldFingerprintSchema,
    model: ModelFingerprintSchema,
    harness: HarnessFingerprintSchema,
    dataset: DatasetFingerprintSchema,
  })
  .strict()

export type ScaffoldFingerprint = z.infer<typeof ScaffoldFingerprintSchema>
export type ModelFingerprint = z.infer<typeof ModelFingerprintSchema>
export type HarnessFingerprint = z.infer<typeof HarnessFingerprintSchema>
export type DatasetFingerprint = z.infer<typeof DatasetFingerprintSchema>
export type FourAxisFingerprint = z.infer<typeof FourAxisFingerprintSchema>

/** Throws ZodError with a structured path if invalid. */
export function parseFourAxisFingerprint(obj: unknown): FourAxisFingerprint {
  return FourAxisFingerprintSchema.parse(obj)
}
