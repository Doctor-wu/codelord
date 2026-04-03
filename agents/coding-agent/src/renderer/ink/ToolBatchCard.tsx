// ---------------------------------------------------------------------------
// ToolBatchCard — grouped container for consecutive tool calls in one turn
// ---------------------------------------------------------------------------

import React from 'react'
import { Box, Text } from 'ink'
import type { ToolBatchItem } from './timeline-projection.js'
import type { ToolCallLifecycle } from '@agent/core'
import { projectDisplayReason } from '@agent/core'
import { ToolCallView } from './ToolCallCard.js'
import { META_COLOR } from './theme.js'

interface ToolBatchCardProps {
  item: ToolBatchItem
  isLast: boolean
}

export function ToolBatchCard({ item, isLast }: ToolBatchCardProps) {
  const { toolCalls, reasoning } = item
  const total = toolCalls.length
  const completedCount = toolCalls.filter(tc => tc.phase === 'completed').length
  const activeIndex = toolCalls.findIndex(tc =>
    tc.phase === 'executing' || tc.phase === 'generating' || tc.phase === 'routed' || tc.phase === 'checked',
  )
  const hasBlocked = toolCalls.some(tc => tc.phase === 'blocked')
  const allDone = completedCount === total

  // Batch-level reasoning summary
  const batchReasoning = reasoning ? projectDisplayReason(reasoning) : null

  // Progress indicator
  const progressText = allDone
    ? `${total}/${total} done`
    : `${completedCount}/${total}`

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* ── Batch header ── */}
      <Box>
        <Text color={META_COLOR}>┌ </Text>
        <Text color={META_COLOR} bold>Work group </Text>
        <Text color={META_COLOR}>{progressText}</Text>
        {hasBlocked && <Text color="red"> (blocked)</Text>}
      </Box>

      {/* ── Batch reasoning context ── */}
      {batchReasoning && (
        <Box>
          <Text color={META_COLOR}>│ </Text>
          <Text dimColor italic>{batchReasoning}</Text>
        </Box>
      )}

      {/* ── Tool calls within the batch ── */}
      {toolCalls.map((tc, index) => (
        <Box key={tc.id} flexDirection="column">
          <Box>
            <Text color={META_COLOR}>{index === total - 1 && allDone ? '└' : '│'} </Text>
            <Text dimColor>{index + 1}/{total} </Text>
          </Box>
          <Box paddingLeft={2}>
            <ToolCallView
              tc={tc}
              isLast={isLast && index === total - 1}
              dimCompleted={!allDone}
            />
          </Box>
        </Box>
      ))}

      {/* ── Batch footer ── */}
      {allDone && (
        <Box>
          <Text color={META_COLOR}>└ </Text>
          <Text dimColor>{total} steps completed</Text>
        </Box>
      )}
    </Box>
  )
}
