// ---------------------------------------------------------------------------
// TimelineStatusBar — compact telemetry strip
// ---------------------------------------------------------------------------

import { Box, Text, useStdout } from 'ink'
import type { TimelineState, ToolCallItem, ToolBatchItem } from './timeline-projection.js'
import type { ToolCallLifecycle } from '@agent/core'
import type { StepCategory } from './theme.js'
import { STEP_COLORS, GLYPH } from './theme.js'
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

function classifyTc(tc: ToolCallLifecycle): StepCategory {
  if (tc.isError) return 'error'
  return tc.toolName === 'bash' ? classifyCommand(tc.command) : classifyToolName(tc.toolName)
}

export function TimelineStatusBar({ state, maxSteps }: TimelineStatusBarProps) {
  const { stdout } = useStdout()
  const cols = Math.max(40, (stdout?.columns ?? 80) - 1)
  const elapsed = Date.now() - state.startTime

  const allToolCalls: ToolCallLifecycle[] = []
  for (const item of state.items) {
    if (item.type === 'tool_call') allToolCalls.push((item as ToolCallItem).toolCall)
    if (item.type === 'tool_batch') allToolCalls.push(...(item as ToolBatchItem).toolCalls)
  }

  const categoryCounts: Partial<Record<StepCategory, number>> = {}
  for (const tc of allToolCalls) {
    const cat = classifyTc(tc)
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1
  }

  const categoryEntries = (Object.entries(categoryCounts) as [StepCategory, number][])
    .filter(([, count]) => count > 0)

  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor>{GLYPH.thinRule.repeat(cols)}</Text>
      </Box>
      <Box justifyContent="space-between">
        <Text dimColor>
          tools {allToolCalls.length}
        </Text>

        <Box gap={2}>
          {categoryEntries.map(([cat, count]) => (
            <Text key={cat} color={STEP_COLORS[cat]} dimColor>
              {count}{cat[0]}
            </Text>
          ))}
        </Box>

        <Text dimColor>{formatElapsed(elapsed)}</Text>
      </Box>
    </Box>
  )
}
