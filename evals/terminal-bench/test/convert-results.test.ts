import fs from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { renderSummaryMarkdown } from '@codelord/evals-shared'

import {
  buildTerminalBenchEvalResult,
  inferModelInfo,
  registerTerminalBenchRenderer,
  type HarborJobConfig,
} from '../src/eval-result.js'
import { loadTrialResults } from '../src/convert-results.js'

const fixtureConfigPath = new URL('../jobs/2026-04-13__15-54-40/config.json', import.meta.url)
const hasFixture = await fs.access(fixtureConfigPath).then(
  () => true,
  () => false,
)

describe.skipIf(!hasFixture)('terminal-bench result conversion', () => {
  it('converts Harbor fixture output into EvalResult', async () => {
    registerTerminalBenchRenderer()

    const fixtureDir = new URL('../jobs/2026-04-13__15-54-40/', import.meta.url)
    const config = JSON.parse(
      await fs.readFile(new URL('../jobs/2026-04-13__15-54-40/config.json', import.meta.url), 'utf8'),
    ) as HarborJobConfig
    const trials = await loadTrialResults(fixtureDir.pathname)
    const result = buildTerminalBenchEvalResult(trials, inferModelInfo(config))

    expect(result.benchmark).toBe('terminal-bench')
    expect(result.model).toBe('claude-sonnet-4-6')
    expect(result.provider).toBe('anthropic')
    expect(result.reasoningLevel).toBe('low')
    expect(result.metrics.total).toBe(4)
    expect(result.metrics.passed_count).toBe(0)
    expect(result.metrics.error_count).toBe(4)
    expect(result.metrics.setup_timeout_count).toBe(1)
    expect(result.metrics.cancelled_count).toBe(3)
    expect(result.cases).toHaveLength(4)
    expect(result.cases.every((caseResult) => caseResult.passed === false)).toBe(true)

    const timeoutCase = result.cases.find((caseResult) => caseResult.id === 'llm-inference-batching-scheduler')
    expect(timeoutCase?.durationMs).toBe(422273)
    expect(timeoutCase?.error).toBe('AgentSetupTimeoutError')
    expect(timeoutCase?.metadata?.agent_setup_duration_ms).toBe(360004)
  })

  it('renders error distribution and timing tables', async () => {
    registerTerminalBenchRenderer()

    const fixtureDir = new URL('../jobs/2026-04-13__15-54-40/', import.meta.url)
    const config = JSON.parse(
      await fs.readFile(new URL('../jobs/2026-04-13__15-54-40/config.json', import.meta.url), 'utf8'),
    ) as HarborJobConfig
    const trials = await loadTrialResults(fixtureDir.pathname)
    const result = buildTerminalBenchEvalResult(trials, inferModelInfo(config))
    const markdown = renderSummaryMarkdown(result)

    expect(markdown).toContain('### Terminal-Bench Error Distribution')
    expect(markdown).toContain('| AgentSetupTimeoutError | 1 | 25.0% |')
    expect(markdown).toContain('| CancelledError | 3 | 75.0% |')
    expect(markdown).toContain('### Terminal-Bench Timing')
    expect(markdown).toContain('| environment_setup |')
    expect(markdown).toContain('| agent_setup |')
    expect(markdown).toContain('| agent_execution | - |')
  })
})
