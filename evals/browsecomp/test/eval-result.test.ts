import { describe, expect, it } from 'vite-plus/test'

import { renderSummaryMarkdown } from '@codelord/evals-shared'

import { buildBrowseCompEvalResult, mapBrowseCompCase, registerBrowseCompRenderer } from '../src/eval-result.js'
import type { BrowseCompResult } from '../src/types.js'

describe('BrowseComp EvalResult helpers', () => {
  it('maps BrowseCompResult to EvalCaseResult', () => {
    const browseResult: BrowseCompResult = {
      id: 7,
      question: 'Which city hosted the 1992 Summer Olympics opening ceremony?',
      referenceAnswer: '',
      agentResponse: 'Explanation: ...\nExact Answer: Barcelona\nConfidence: 88%',
      extractedAnswer: 'Barcelona',
      confidence: 88,
      grade: 'CORRECT',
      graderReasoning: 'Matches the official record.',
      durationMs: 1234,
      traceId: 'trace-7',
    }

    expect(mapBrowseCompCase(browseResult)).toEqual({
      id: '7',
      passed: true,
      durationMs: 1234,
      error: undefined,
      metadata: {
        confidence: 88,
        grade: 'CORRECT',
        graderReasoning: 'Matches the official record.',
        extractedAnswer: 'Barcelona',
        questionPreview: 'Which city hosted the 1992 Summer Olympics opening ceremony?',
      },
    })
  })

  it('renders grade and confidence distribution tables', () => {
    registerBrowseCompRenderer()

    const results: BrowseCompResult[] = [
      {
        id: 1,
        question: 'Q1',
        referenceAnswer: '',
        agentResponse: 'A1',
        extractedAnswer: 'A1',
        confidence: 10,
        grade: 'ERROR',
        graderReasoning: 'timeout',
        durationMs: 100,
        traceId: 't1',
        error: 'timeout',
      },
      {
        id: 2,
        question: 'Q2',
        referenceAnswer: '',
        agentResponse: 'A2',
        extractedAnswer: 'A2',
        confidence: 60,
        grade: 'CORRECT',
        graderReasoning: 'ok',
        durationMs: 200,
        traceId: 't2',
      },
      {
        id: 3,
        question: 'Q3',
        referenceAnswer: '',
        agentResponse: 'A3',
        extractedAnswer: 'A3',
        confidence: 90,
        grade: 'INCORRECT',
        graderReasoning: 'wrong',
        durationMs: 300,
        traceId: 't3',
      },
    ]

    const evalResult = buildBrowseCompEvalResult(results, {
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      reasoningLevel: 'low',
      limit: 3,
      offset: 0,
      skipGrade: false,
    })

    expect(evalResult.metrics).toEqual({
      accuracy: 1 / 3,
      total: 3,
      correct_count: 1,
      incorrect_count: 1,
      error_count: 1,
      avg_confidence: (10 + 60 + 90) / 3,
      avg_duration_ms: (100 + 200 + 300) / 3,
    })

    const markdown = renderSummaryMarkdown(evalResult)
    expect(markdown).toContain('## 🧪 Eval Results: browsecomp')
    expect(markdown).toContain('| accuracy | 0.3333333333333333 |')
    expect(markdown).toContain('### BrowseComp Grade Distribution')
    expect(markdown).toContain('| CORRECT | 1 | 33.3% |')
    expect(markdown).toContain('| INCORRECT | 1 | 33.3% |')
    expect(markdown).toContain('| ERROR | 1 | 33.3% |')
    expect(markdown).toContain('### BrowseComp Confidence Distribution')
    expect(markdown).toContain('| 0-25% | 1 |')
    expect(markdown).toContain('| 51-75% | 1 |')
    expect(markdown).toContain('| 76-100% | 1 |')
  })
})
