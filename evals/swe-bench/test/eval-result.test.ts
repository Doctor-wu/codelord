import { describe, expect, it } from 'vitest'

import { renderSummaryMarkdown } from '@codelord/evals-shared'

import { buildSWEBenchEvalResult, registerSWEBenchRenderer } from '../src/eval-result.js'
import type { SolveResult } from '../src/types.js'

describe('buildSWEBenchEvalResult', () => {
  it('builds standard metrics and renders by-repo markdown', () => {
    registerSWEBenchRenderer()

    const results: SolveResult[] = [
      {
        instance_id: 'astropy__astropy-1',
        repo: 'astropy/astropy',
        base_commit: 'abc123',
        model_patch: 'diff --git a/file b/file',
        durationMs: 1200,
        traceId: 'trace-1',
      },
      {
        instance_id: 'psf__requests-2',
        repo: 'psf/requests',
        base_commit: 'def456',
        model_patch: '',
        durationMs: 800,
        traceId: 'trace-2',
        error: 'agent timeout',
      },
    ]

    const evalResult = buildSWEBenchEvalResult(results, {
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      reasoningLevel: 'low',
      limit: 2,
      repos: ['astropy/astropy', 'psf/requests'],
      instanceIds: ['astropy__astropy-1', 'psf__requests-2'],
    })

    expect(evalResult.metrics).toEqual({
      patch_rate: 0.5,
      total: 2,
      patched_count: 1,
      error_count: 1,
      avg_duration_ms: 1000,
    })
    expect(evalResult.cases[0]).toMatchObject({
      id: 'astropy__astropy-1',
      passed: true,
      durationMs: 1200,
      metadata: {
        repo: 'astropy/astropy',
        patch_length: 24,
        traceId: 'trace-1',
      },
    })
    expect(evalResult.cases[1]).toMatchObject({
      id: 'psf__requests-2',
      passed: false,
      error: 'agent timeout',
      metadata: {
        repo: 'psf/requests',
        patch_length: 0,
      },
    })

    const markdown = renderSummaryMarkdown(evalResult)
    expect(markdown).toContain('## 🧪 Eval Results: swe-bench')
    expect(markdown).toContain('| patch_rate | 0.5 |')
    expect(markdown).toContain('### SWE-bench by Repository')
    expect(markdown).toContain('| astropy/astropy | 1 | 1 | 1.000 |')
    expect(markdown).toContain('| psf/requests | 1 | 0 | 0.000 |')
  })
})
