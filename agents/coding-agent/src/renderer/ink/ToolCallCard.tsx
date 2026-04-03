// ---------------------------------------------------------------------------
// ToolCallCard — renders a single tool call from the timeline
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from 'react'
import { Box, Text, useStdout } from 'ink'
import type { ToolCallItem } from './timeline-projection.js'
import type { ToolCallLifecycle } from '@agent/core'
import { classifyCommand, classifyToolName } from './classify.js'
import { STEP_COLORS, META_COLOR } from './theme.js'
import type { StepCategory } from './theme.js'
import { formatToolDisplayName, extractToolCommand } from '../tool-display.js'
import { normalizeInline, getDisplayWidth, formatToolResultLines, wrapPlainText } from './summarize.js'

interface ToolCallCardProps {
  item: ToolCallItem
  isLast: boolean
}

export function ToolCallCard({ item, isLast }: ToolCallCardProps) {
  const tc = item.toolCall
  const isRunning = tc.phase === 'executing' || tc.phase === 'generating' || tc.phase === 'routed' || tc.phase === 'checked'
  const category = classifyToolCallCategory(tc)
  const color = STEP_COLORS[category]
  const toolName = formatToolDisplayName(tc.toolName)
  const command = extractToolCommand(tc.toolName, tc.args)
  const { stdout } = useStdout()
  const availableWidth = Math.max(18, (stdout?.columns ?? 80) - 12)

  // Breathing animation
  const breathingPhase = useBreathingPhase(isRunning && isLast)
  const isPulseDimmed = breathingPhase >= 2

  // Build display output
  const displayResult = buildDisplayResult(tc)
  const { headLines, tailLines, hiddenLineCount } = formatToolResultLines(displayResult)
  const contentWidth = Math.max(16, (stdout?.columns ?? 80) - 6)

  // Title
  const normalizedCommand = normalizeInline(command)
  const firstLineWidth = Math.max(8, availableWidth - (isRunning ? 2 : 0))
  const prefix = `${toolName}(`
  const suffix = ')'
  const singleLine = `${prefix}${normalizedCommand}${suffix}`
  const fitsOneLine = getDisplayWidth(singleLine) <= firstLineWidth

  // Route/safety badges
  const routeBadge = tc.route?.wasRouted ? `routed: ${tc.route.originalToolName} → ${tc.toolName}` : null
  const safetyBadge = tc.safety && !tc.safety.allowed ? `blocked: ${tc.safety.reason}` : null

  // Status
  const statusLabel = getStatusLabel(tc)
  const footerColor = tc.isError ? 'red' : 'green'

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Category badge */}
      <Box>
        <Text color={color}>{'\u2503'} </Text>
        <Text color={color} bold>{category.toUpperCase()}</Text>
        {routeBadge && <Text dimColor> ({routeBadge})</Text>}
      </Box>

      {/* Tool name + command */}
      <Box>
        <Text color={color}>{'\u2503'} </Text>
        {isRunning && (
          <>
            <Text color={color} dimColor={isPulseDimmed}>{'\u25CF'}</Text>
            <Text> </Text>
          </>
        )}
        <Text bold>{toolName}</Text>
        <Text>({fitsOneLine ? normalizedCommand : normalizedCommand.slice(0, firstLineWidth - getDisplayWidth(prefix))})</Text>
      </Box>

      {/* Safety blocked message */}
      {safetyBadge && (
        <Box>
          <Text color={color}>{'\u2503'} </Text>
          <Text color="red">{'\u26A0'} {safetyBadge}</Text>
        </Box>
      )}

      {/* Status label */}
      {statusLabel && (
        <Box>
          <Text color={color}>{'\u2503'} </Text>
          <Text dimColor>{'\u23BF '}</Text>
          <Text color={META_COLOR}>{statusLabel}</Text>
        </Box>
      )}

      {/* Output lines */}
      {headLines.map((line, i) => (
        <Box key={`h-${i}`}>
          <Text color={color}>{'\u2503'} </Text>
          <Text dimColor>{i === 0 ? '\u23BF ' : '  '}</Text>
          <Text color={tc.isError ? 'red' : undefined}>{line || ' '}</Text>
        </Box>
      ))}

      {hiddenLineCount > 0 && (
        <Box>
          <Text color={color}>{'\u2503'} </Text>
          <Text dimColor>{'  '}</Text>
          <Text color={META_COLOR}>+{hiddenLineCount} lines</Text>
        </Box>
      )}

      {tailLines.map((line, i) => (
        <Box key={`t-${i}`}>
          <Text color={color}>{'\u2503'} </Text>
          <Text dimColor>{'  '}</Text>
          <Text color={tc.isError ? 'red' : undefined}>{line || ' '}</Text>
        </Box>
      ))}

      {/* Completion footer */}
      {tc.completedAt && (
        <Box>
          <Text color={color}>{'\u2503'} </Text>
          <Text color={footerColor}>
            {tc.isError ? '\u2717' : '\u2713'}
          </Text>
          <Text> </Text>
          <Text color={footerColor}>
            {tc.isError ? 'Tool call failed' : 'Tool call success'}
          </Text>
        </Box>
      )}
    </Box>
  )
}

function classifyToolCallCategory(tc: ToolCallLifecycle): Exclude<StepCategory, 'text'> {
  if (tc.isError) return 'error'
  return tc.toolName === 'bash'
    ? classifyCommand(tc.command)
    : classifyToolName(tc.toolName)
}

function buildDisplayResult(tc: ToolCallLifecycle): string {
  // During execution, show streaming stdout/stderr
  if (tc.phase === 'executing') {
    const parts: string[] = []
    if (tc.stdout) parts.push(`stdout:\n${tc.stdout}`)
    if (tc.stderr) parts.push(`stderr:\n${tc.stderr}`)
    return parts.join('\n') || ''
  }
  // After completion, show the result
  if (tc.result) return tc.result
  return ''
}

function getStatusLabel(tc: ToolCallLifecycle): string | null {
  if (tc.completedAt) return null
  if (tc.phase === 'executing' && !tc.stdout && !tc.stderr) return 'executing tool...'
  if (tc.phase === 'generating' || tc.phase === 'routed' || tc.phase === 'checked') return 'building command...'
  return null
}

function useBreathingPhase(isActive: boolean): number {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    if (!isActive) {
      setPhase(0)
      return
    }
    const interval = setInterval(() => {
      setPhase((current) => (current + 1) % 4)
    }, 350)
    return () => clearInterval(interval)
  }, [isActive])

  return phase
}
