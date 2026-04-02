import { describe, expect, it } from 'vitest'
import {
  finalizeCompletedStepCategory,
  getStatusCategoryCounts,
  type StepState,
} from '../src/renderer/ink/state.js'

function makeStep(overrides: Partial<StepState> = {}): StepState {
  return {
    step: 1,
    category: 'read',
    thinking: '',
    text: '',
    toolCalls: [],
    isComplete: true,
    ...overrides,
  }
}

describe('finalizeCompletedStepCategory', () => {
  it('marks pure text steps as text', () => {
    const category = finalizeCompletedStepCategory(
      makeStep({
        category: 'read',
        text: 'hi, I am codelord',
        toolCalls: [],
      }),
    )

    expect(category).toBe('text')
  })

  it('keeps tool-backed categories unchanged', () => {
    const category = finalizeCompletedStepCategory(
      makeStep({
        category: 'verify',
        toolCalls: [
          {
            name: 'bash',
            args: { command: 'pnpm test' },
            command: 'pnpm test',
            isError: false,
            startTime: 0,
          },
        ],
      }),
    )

    expect(category).toBe('verify')
  })
})

describe('getStatusCategoryCounts', () => {
  it('excludes text steps from status bar counts', () => {
    const counts = getStatusCategoryCounts(
      [
        makeStep({
          category: 'text',
          text: 'hi there',
        }),
        makeStep({
          category: 'read',
          toolCalls: [
            {
              name: 'bash',
              args: { command: 'rg theme' },
              command: 'rg theme',
              isError: false,
              startTime: 0,
            },
          ],
        }),
      ],
      makeStep({
        isComplete: false,
        category: 'write',
        toolCalls: [
          {
            name: 'edit',
            args: {},
            command: 'edit',
            isError: false,
            startTime: 0,
          },
        ],
      }),
    )

    expect(counts).toEqual({
      read: 1,
      write: 1,
    })
  })
})
