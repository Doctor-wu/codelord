import { describe, expect, it } from 'vitest'

import { registerBenchmarkRenderer, renderSummaryMarkdown } from '../src/index.js'
import type { EvalResult } from '../src/index.js'

describe('renderSummaryMarkdown', () => {
  it('renders overview, cases, and benchmark-specific extension tables', () => {
    registerBenchmarkRenderer('polyglot', () => [
      '### By Language',
      '',
      '| language | total | pass@1 | pass@2 | pass_rate_1 | pass_rate_2 |',
      '| --- | --- | --- | --- | --- | --- |',
      '| python | 1 | 1 | 1 | 1.000 | 1.000 |',
    ].join('\n'))

    const result: EvalResult = {
      benchmark: 'polyglot',
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      reasoningLevel: 'low',
      timestamp: '2026-04-13T12:00:00.000Z',
      config: {
        mode: 'subset',
        limit: 2,
        languages: ['python', 'javascript'],
      },
      metrics: {
        pass_rate_1: 0.5,
        pass_rate_2: 0.5,
        total: 2,
        pass_attempt_1: 1,
        pass_attempt_2: 1,
      },
      cases: [
        {
          id: 'python/two-bucket',
          passed: true,
          durationMs: 1_200,
        },
        {
          id: 'javascript/hello-world',
          passed: false,
          durationMs: 800,
          error: 'timeout',
        },
      ],
      durationMs: 2_000,
    }

    const markdown = renderSummaryMarkdown(result)

    expect(markdown).toContain('## 🧪 Eval Results: polyglot')
    expect(markdown).toContain('| Metric | Value |')
    expect(markdown).toContain('| model | claude-sonnet-4-6 |')
    expect(markdown).toContain('| pass_rate_1 | 0.5 |')
    expect(markdown).toContain('| total | 2 |')
    expect(markdown).toContain('| id | passed | durationMs | error |')
    expect(markdown).toContain('| python/two-bucket | ✅ | 1200 |  |')
    expect(markdown).toContain('| javascript/hello-world | ❌ | 800 | timeout |')
    expect(markdown).toContain('### By Language')
    expect(markdown).toContain('| python | 1 | 1 | 1 | 1.000 | 1.000 |')
  })
})
