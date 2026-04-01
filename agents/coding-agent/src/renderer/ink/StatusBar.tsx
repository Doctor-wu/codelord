// ---------------------------------------------------------------------------
// StatusBar — bottom bar with step count, category stats, elapsed time
// ---------------------------------------------------------------------------

import { Box, Text } from 'ink'
import type { AppState } from './state.js'
import type { StepCategory } from './theme.js'
import { STEP_COLORS } from './theme.js'

interface StatusBarProps {
  state: AppState
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${minutes}m${remaining}s`
}

export function StatusBar({ state }: StatusBarProps) {
  const elapsed = Date.now() - state.startTime
  const totalSteps = state.steps.length + (state.currentStep ? 1 : 0)

  // Count tool calls by category across all steps
  const categoryCounts: Partial<Record<StepCategory, number>> = {}
  for (const step of state.steps) {
    categoryCounts[step.category] = (categoryCounts[step.category] ?? 0) + 1
  }
  if (state.currentStep) {
    const cat = state.currentStep.category
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1
  }

  return (
    <Box>
      <Text dimColor>{'\u2500'.repeat(60)}</Text>
    </Box>
  )
}

export function StatusBarContent({ state }: StatusBarProps) {
  const elapsed = Date.now() - state.startTime
  const totalSteps = state.steps.length + (state.currentStep ? 1 : 0)

  const categoryCounts: Partial<Record<StepCategory, number>> = {}
  for (const step of state.steps) {
    categoryCounts[step.category] = (categoryCounts[step.category] ?? 0) + 1
  }
  if (state.currentStep) {
    const cat = state.currentStep.category
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1
  }

  const categoryEntries = (Object.entries(categoryCounts) as [StepCategory, number][])
    .filter(([, count]) => count > 0)

  return (
    <Box justifyContent="space-between">
      <Text dimColor>
        Step {totalSteps}/{state.maxSteps}
      </Text>

      <Box gap={2}>
        {categoryEntries.map(([cat, count]) => (
          <Text key={cat} color={STEP_COLORS[cat]}>
            {count} {cat}
          </Text>
        ))}
      </Box>

      <Text dimColor>{formatElapsed(elapsed)}</Text>
    </Box>
  )
}
