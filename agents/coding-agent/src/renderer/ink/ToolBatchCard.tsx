// ---------------------------------------------------------------------------
// ToolBatchCard — work group container for consecutive tool calls
// ---------------------------------------------------------------------------

import React from 'react'
import { Box, Text } from 'ink'
import type { ToolBatchItem } from './timeline-projection.js'
import { ToolCallView } from './ToolCallCard.js'
import { GLYPH, LANE } from './theme.js'

interface ToolBatchCardProps {
  item: ToolBatchItem
  isLast: boolean
}

export function ToolBatchCard({ item, isLast }: ToolBatchCardProps) {
  const { toolCalls } = item
  const total = toolCalls.length
  const completedCount = toolCalls.filter(tc => tc.phase === 'completed').length
  const hasBlocked = toolCalls.some(tc => tc.phase === 'blocked')
  const allDone = completedCount === total

  // Batch reasoning is intentionally NOT projected from generic assistant thought.
  // Only explicit batch-scoped rationale would be shown here (not yet available).
  const headerColor = allDone ? LANE.muted : LANE.assistant

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* ── Batch header ── */}
      <Box>
        <Text color={headerColor}>{GLYPH.batchTop} </Text>
        <Text color={headerColor}>work group</Text>
        <Text dimColor> {completedCount}/{total}</Text>
        {hasBlocked && <Text color={LANE.error}> blocked</Text>}
      </Box>

      {/* ── Tool calls ── */}
      {toolCalls.map((tc, index) => {
        const isLastStep = index === total - 1
        const rail = isLastStep && allDone ? GLYPH.batchBot : GLYPH.batchMid

        return (
          <Box key={tc.id} flexDirection="column">
            <Box>
              <Text color={headerColor}>{rail} </Text>
              <Box>
                <ToolCallView
                  tc={tc}
                  isLast={isLast && isLastStep}
                  dimCompleted={!allDone}
                />
              </Box>
            </Box>
          </Box>
        )
      })}

      {/* ── Batch footer ── */}
      {allDone && (
        <Box>
          <Text color={headerColor}>{GLYPH.batchBot} </Text>
          <Text dimColor>{total} steps done</Text>
        </Box>
      )}
    </Box>
  )
}
