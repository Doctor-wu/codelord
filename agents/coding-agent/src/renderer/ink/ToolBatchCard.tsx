// ---------------------------------------------------------------------------
// ToolBatchCard — work group container for consecutive tool calls
// ---------------------------------------------------------------------------

import React from 'react'
import { Box, Text } from 'ink'
import type { ToolBatchItem } from './timeline-projection.js'
import { projectDisplayReason } from '@agent/core'
import { ToolCallView } from './ToolCallCard.js'
import { GLYPH, LANE } from './theme.js'

interface ToolBatchCardProps {
  item: ToolBatchItem
  isLast: boolean
}

export function ToolBatchCard({ item, isLast }: ToolBatchCardProps) {
  const { toolCalls, reasoning } = item
  const total = toolCalls.length
  const completedCount = toolCalls.filter(tc => tc.phase === 'completed').length
  const hasBlocked = toolCalls.some(tc => tc.phase === 'blocked')
  const allDone = completedCount === total

  const batchReasoning = reasoning ? projectDisplayReason(reasoning) : null
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

      {/* ── Batch reasoning context ── */}
      {batchReasoning && (
        <Box>
          <Text color={headerColor}>{GLYPH.batchMid} </Text>
          <Text color={LANE.reasoning} italic>{batchReasoning}</Text>
        </Box>
      )}

      {/* ── Tool calls ── */}
      {toolCalls.map((tc, index) => {
        const isActiveStep = tc.phase === 'executing' || tc.phase === 'generating' || tc.phase === 'routed' || tc.phase === 'checked'
        const isCompletedStep = tc.phase === 'completed'
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
