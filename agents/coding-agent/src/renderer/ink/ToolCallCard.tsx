// ---------------------------------------------------------------------------
// ToolCallCard — production-grade tool call display for the conversation timeline
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from 'react'
import { Box, Text, useStdout } from 'ink'
import type { ToolCallItem } from './timeline-projection.js'
import type { ToolCallLifecycle } from '@agent/core'
import { classifyCommand, classifyToolName } from './classify.js'
import { STEP_COLORS, META_COLOR } from './theme.js'
import type { StepCategory } from './theme.js'
import { formatToolDisplayName, extractToolCommand } from '../tool-display.js'
import { normalizeInline, getDisplayWidth, formatToolResultLines } from './summarize.js'

interface ToolCallCardProps {
  item: ToolCallItem
  isLast: boolean
}

export function ToolCallCard({ item, isLast }: ToolCallCardProps) {
  const tc = item.toolCall
  const isRunning = tc.phase === 'executing' || tc.phase === 'generating' || tc.phase === 'routed' || tc.phase === 'checked'
  const isBlocked = tc.phase === 'blocked'
  const isDone = tc.phase === 'completed'
  const category = classifyToolCallCategory(tc)
  const color = STEP_COLORS[category]
  const toolName = formatToolDisplayName(tc.toolName)
  const command = extractToolCommand(tc.toolName, tc.args)
  const { stdout } = useStdout()
  const availableWidth = Math.max(18, (stdout?.columns ?? 80) - 8)

  // Breathing animation for running state
  const breathingPhase = useBreathingPhase(isRunning && isLast)
  const isPulseDimmed = breathingPhase >= 2

  // Phase indicator
  const phaseIcon = getPhaseIcon(tc, isPulseDimmed)
  const phaseLabel = getPhaseLabel(tc)

  // Command display
  const normalizedCommand = normalizeInline(command)
  const titleLine = `${toolName}(${normalizedCommand})`
  const maxTitleWidth = availableWidth - 4
  const displayTitle = getDisplayWidth(titleLine) <= maxTitleWidth
    ? titleLine
    : `${toolName}(${normalizedCommand.slice(0, maxTitleWidth - toolName.length - 3)}…)`

  // Result display
  const displayResult = buildDisplayResult(tc)
  const { headLines, tailLines, hiddenLineCount } = formatToolResultLines(displayResult)

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* ── Header: phase icon + tool name + command ── */}
      <Box>
        <Text color={color}>{phaseIcon} </Text>
        <Text color={color} bold>{displayTitle}</Text>
        {phaseLabel && <Text dimColor> {phaseLabel}</Text>}
      </Box>

      {/* ── Reasoning: why this tool was called ── */}
      {tc.displayReason && (
        <Box paddingLeft={3}>
          <Text dimColor italic>↳ {tc.displayReason}</Text>
        </Box>
      )}

      {/* ── Route badge: original → actual ── */}
      {tc.route?.wasRouted && (
        <Box paddingLeft={3}>
          <Text color="blue">⤷ </Text>
          <Text dimColor>{formatToolDisplayName(tc.route.originalToolName)}</Text>
          <Text dimColor> → </Text>
          <Text>{toolName}</Text>
          {tc.route.reason && <Text dimColor> ({tc.route.reason})</Text>}
        </Box>
      )}

      {/* ── Safety badge ── */}
      {tc.safety && !tc.safety.allowed && (
        <Box paddingLeft={3}>
          <Text color="red" bold>⛔ BLOCKED </Text>
          <Text color="red">risk:{tc.safety.riskLevel}</Text>
          {tc.safety.reason && <Text color="red" dimColor> — {tc.safety.reason}</Text>}
        </Box>
      )}
      {tc.safety && tc.safety.allowed && tc.safety.riskLevel !== 'safe' && (
        <Box paddingLeft={3}>
          <Text color="yellow">⚠ risk:{tc.safety.riskLevel}</Text>
        </Box>
      )}

      {/* ── Streaming output ── */}
      {headLines.length > 0 && (
        <Box flexDirection="column" paddingLeft={3}>
          {headLines.map((line, i) => (
            <Box key={`h-${i}`}>
              <Text dimColor>{i === 0 ? '⎿ ' : '  '}</Text>
              <Text color={tc.isError ? 'red' : undefined} dimColor={isDone && !tc.isError}>{line || ' '}</Text>
            </Box>
          ))}
          {hiddenLineCount > 0 && (
            <Box>
              <Text dimColor>  </Text>
              <Text color={META_COLOR}>+{hiddenLineCount} lines</Text>
            </Box>
          )}
          {tailLines.map((line, i) => (
            <Box key={`t-${i}`}>
              <Text dimColor>  </Text>
              <Text color={tc.isError ? 'red' : undefined} dimColor={isDone && !tc.isError}>{line || ' '}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* ── Completion footer ── */}
      {tc.completedAt && (
        <Box paddingLeft={3}>
          <Text color={tc.isError ? 'red' : 'green'}>
            {tc.isError ? '✗ failed' : '✓ done'}
          </Text>
          {tc.executionStartedAt && (
            <Text dimColor> {formatDuration(tc.completedAt - tc.executionStartedAt)}</Text>
          )}
        </Box>
      )}
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classifyToolCallCategory(tc: ToolCallLifecycle): Exclude<StepCategory, 'text'> {
  if (tc.isError) return 'error'
  return tc.toolName === 'bash'
    ? classifyCommand(tc.command)
    : classifyToolName(tc.toolName)
}

function getPhaseIcon(tc: ToolCallLifecycle, dimmed: boolean): string {
  if (tc.phase === 'blocked') return '⛔'
  if (tc.completedAt) return tc.isError ? '✗' : '✓'
  if (tc.phase === 'executing') return dimmed ? '○' : '●'
  return dimmed ? '○' : '●'
}

function getPhaseLabel(tc: ToolCallLifecycle): string | null {
  if (tc.completedAt) return null
  switch (tc.phase) {
    case 'generating': return 'building…'
    case 'routed': return 'routed'
    case 'checked': return 'checked'
    case 'executing':
      return (!tc.stdout && !tc.stderr) ? 'executing…' : null
    case 'blocked': return 'blocked'
    default: return null
  }
}

function buildDisplayResult(tc: ToolCallLifecycle): string {
  if (tc.phase === 'executing') {
    const parts: string[] = []
    if (tc.stdout) parts.push(tc.stdout)
    if (tc.stderr) parts.push(`stderr: ${tc.stderr}`)
    return parts.join('\n') || ''
  }
  if (tc.result) return tc.result
  return ''
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = (ms / 1000).toFixed(1)
  return `${s}s`
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
