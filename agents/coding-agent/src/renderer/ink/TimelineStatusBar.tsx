// ---------------------------------------------------------------------------
// TimelineStatusBar — bottom bar for timeline-driven UI
// ---------------------------------------------------------------------------

import { Box, Text } from 'ink'
import type { TimelineState, ToolCallItem } from './timeline-projection.js'
import type { StepCategory } from './theme.js'
import { STEP_COLORS } from './theme.js'
import { classifyCommand, classifyToolName } from './classify.js'

interface TimelineStatusBarProps {
  state: TimelineState
  maxSteps: number
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${minutes}m${remaining}s`
}

export function TimelineStatusBar({ state, maxSteps }: TimelineStatusBarProps) {
  const elapsed = Date.now() - state.startTime
  const toolItems = state.items.filter((i): i is ToolCallItem => i.type === 'tool_call')
  const categoryCounts: Partial<Record<StepCategory, number>> = {}

  for (const item of toolItems) {
    const tc = item.toolCall
    const cat: StepCategory = tc.isError
      ? 'error'
      : tc.toolName === 'bash'
        ? classifyCommand(tc.command)
        : classifyToolName(tc.toolName)
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1
  }

  const categoryEntries = (Object.entries(categoryCounts) as [StepCategory, number][])
    .filter(([, count]) => count > 0)

  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor>{'\u2500'.repeat(60)}</Text>
      </Box>
      <Box justifyContent="space-between">
        <Text dimColor>
          Tools {toolItems.length}
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
    </Box>
  )
}
