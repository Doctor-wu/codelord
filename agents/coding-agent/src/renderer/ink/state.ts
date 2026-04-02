// ---------------------------------------------------------------------------
// Shared state model for the Ink TUI
// ---------------------------------------------------------------------------

import type { StepCategory } from './theme.js'

export interface ToolCallState {
  streamKey?: string
  name: string
  args: Record<string, unknown>
  command: string // extracted bash command or tool name
  result?: string
  isError: boolean
  isExecuting: boolean
  hasStdout: boolean
  hasStderr: boolean
  startTime: number
  endTime?: number
}

export interface StepState {
  step: number
  category: StepCategory
  thinking: string // accumulated thinking_delta
  text: string // accumulated text_delta
  toolCalls: ToolCallState[]
  isComplete: boolean
}

export interface AppState {
  steps: StepState[] // completed steps
  currentStep: StepState | null
  finalAnswer: string | null
  error: string | null
  startTime: number
  isRunning: boolean
  maxSteps: number
}

export function finalizeCompletedStepCategory(
  step: Pick<StepState, 'category' | 'toolCalls'>,
): StepCategory {
  if (step.toolCalls.length === 0) return 'text'
  return step.category
}

export function getStatusCategoryCounts(
  steps: StepState[],
  currentStep: StepState | null,
): Partial<Record<StepCategory, number>> {
  const categoryCounts: Partial<Record<StepCategory, number>> = {}

  for (const step of currentStep ? [...steps, currentStep] : steps) {
    if (step.category === 'text') continue
    categoryCounts[step.category] = (categoryCounts[step.category] ?? 0) + 1
  }

  return categoryCounts
}

export function createInitialState(maxSteps: number): AppState {
  return {
    steps: [],
    currentStep: null,
    finalAnswer: null,
    error: null,
    startTime: Date.now(),
    isRunning: true,
    maxSteps,
  }
}
