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

  // Progress bar segments
  const progressBar = toolCalls.map(tc => {
    if (tc.phase === 'completed') return tc.isError ? '✗' : '━'
    if (tc.phase === 'blocked') return '⊘'
    if (tc.phase === 'executing' || tc.phase === 'generating' || tc.phase === 'routed' || tc.phase === 'checked') return '◉'
    return '·'
  }).join('')

  const headerColor = allDone ? '#555555' : LANE.assistant

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* ── Batch header ── */}
      <Box>
        <Text color={headerColor}>{GLYPH.batchTop}{GLYPH.thickRule} </Text>
        <Text color={headerColor} bold>WORK GROUP</Text>
        <Text color={headerColor}> [{progressBar}] </Text>
        <Text dimColor>{completedCount}/{total}</Text>
        {hasBlocked && <Text color="red"> blocked</Text>}
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

        return (
          <Box key={tc.id} flexDirection="column">
            {/* Step index marker */}
            <Box>
              <Text color={headerColor}>{isLastStep && allDone ? GLYPH.batchBot : GLYPH.batchMid} </Text>
              <Text dimColor={isCompletedStep} bold={isActiveStep}>
                {isActiveStep ? GLYPH.live : GLYPH.settled} {index + 1}/{total}
              </Text>
            </Box>
            {/* Tool view, indented under the batch rail */}
            <Box paddingLeft={2}>
              <ToolCallView
                tc={tc}
                isLast={isLast && isLastStep}
                dimCompleted={!allDone}
              />
            </Box>
          </Box>
        )
      })}

      {/* ── Batch footer ── */}
      {allDone && (
        <Box>
          <Text color={headerColor}>{GLYPH.batchBot}{GLYPH.thickRule} </Text>
          <Text dimColor>{total} steps {GLYPH.phaseDone}</Text>
        </Box>
      )}
    </Box>
  )
}
