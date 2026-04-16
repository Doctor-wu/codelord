import { describe, expect, it } from 'vite-plus/test'

import type { EvalResult } from '../evals/shared/src/types.js'
import {
  buildInitialScoresState,
  renderScoresMarkdown,
  updateBenchmarkEntries,
  updateScoresState,
} from './update-scores.js'

function createTerminalBenchResult(timestamp: string, resolutionRate: number, passedCount: number): EvalResult {
  return {
    benchmark: 'terminal-bench',
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    reasoningLevel: 'low',
    timestamp,
    config: {
      mode: 'subset',
      limit: 3,
      n_concurrent: 4,
    },
    metrics: {
      resolution_rate: resolutionRate,
      total: 3,
      passed_count: passedCount,
      error_count: 3 - passedCount,
      setup_timeout_count: 0,
      cancelled_count: 0,
    },
    cases: [
      { id: 'task-1', passed: passedCount >= 1, durationMs: 1000 },
      { id: 'task-2', passed: passedCount >= 2, durationMs: 1000 },
      { id: 'task-3', passed: passedCount >= 3, durationMs: 1000 },
    ],
    durationMs: 3000,
  }
}

describe('update-scores', () => {
  it('renders the initial M3-S1 baseline scoreboard', () => {
    const state = buildInitialScoresState()
    const markdown = renderScoresMarkdown(state)

    expect(markdown).toContain('# Codelord Eval Scores')
    expect(markdown).toContain(
      '| Polyglot | claude-sonnet-4-6 | pass_rate_1 | 100.0% | 20 | subset | 2026-04-12 | M3-S1 manual |',
    )
    expect(markdown).toContain(
      '| Polyglot (Rust) | claude-sonnet-4-6 | pass_rate_1 | 93.3% | 30 | subset | 2026-04-12 | M3-S1 manual |',
    )
    expect(markdown).toContain(
      '| Terminal-Bench | claude-sonnet-4-6 | resolution_rate | 33.3% | 3 | subset | 2026-04-12 | M3-S1 manual |',
    )

    // No longer embeds state in markdown
    expect(markdown).not.toContain('SCORES_STATE_V1')
  })

  it('prepends new benchmark runs and keeps history entries (via updateScoresState)', () => {
    const firstUpdate = createTerminalBenchResult('2026-04-13T16:00:00Z', 0, 0)
    const secondUpdate = createTerminalBenchResult('2026-04-14T08:30:00Z', 2 / 3, 2)

    const stateAfterFirst = updateScoresState(
      buildInitialScoresState(),
      'terminal-bench',
      firstUpdate,
      'https://github.com/Doctor-wu/codelord/actions/runs/12345',
    )
    const stateAfterSecond = updateScoresState(
      stateAfterFirst,
      'terminal-bench',
      secondUpdate,
      'https://github.com/Doctor-wu/codelord/actions/runs/23456',
    )

    const markdown = renderScoresMarkdown(stateAfterSecond)
    const terminalBenchHistory = stateAfterSecond.history['terminal-bench']

    expect(terminalBenchHistory).toHaveLength(3)
    expect(terminalBenchHistory[0]?.date).toBe('2026-04-14')
    expect(terminalBenchHistory[0]?.metrics.resolution_rate).toBeCloseTo(2 / 3)
    expect(terminalBenchHistory[1]?.date).toBe('2026-04-13')
    expect(terminalBenchHistory[2]?.date).toBe('2026-04-12')

    expect(markdown).toContain(
      '| Terminal-Bench | claude-sonnet-4-6 | resolution_rate | 66.7% | 3 | subset | 2026-04-14 | [CI run](https://github.com/Doctor-wu/codelord/actions/runs/23456) |',
    )
    expect(markdown).toContain(
      '| 2026-04-14 | claude-sonnet-4-6 | 66.7% | 3 | subset | [CI run](https://github.com/Doctor-wu/codelord/actions/runs/23456) |',
    )
    expect(markdown).toContain(
      '| 2026-04-13 | claude-sonnet-4-6 | 0.0% | 3 | subset | [CI run](https://github.com/Doctor-wu/codelord/actions/runs/12345) |',
    )
  })

  it('updateBenchmarkEntries works on isolated entry arrays', () => {
    const initial = buildInitialScoresState()
    const entries = initial.history['terminal-bench']
    const result = createTerminalBenchResult('2026-04-15T10:00:00Z', 1, 3)

    const updated = updateBenchmarkEntries(entries, 'terminal-bench', result, 'https://example.com/run/1')

    expect(updated).toHaveLength(2)
    expect(updated[0]?.date).toBe('2026-04-15')
    expect(updated[0]?.metrics.resolution_rate).toBe(1)
    expect(updated[1]?.date).toBe('2026-04-12')
  })
})
