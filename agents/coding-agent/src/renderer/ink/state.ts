// ---------------------------------------------------------------------------
// Shared state model for the Ink TUI
// ---------------------------------------------------------------------------

import type { StepCategory } from './theme.js'

export interface ToolCallState {
  name: string
  args: Record<string, unknown>
  command: string // extracted bash command or tool name
  result?: string
  isError: boolean
  startTime: number
  endTime?: number
}

export interface StepState {
  step: number
  category: StepCategory
  thought: string // accumulated text_delta
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
