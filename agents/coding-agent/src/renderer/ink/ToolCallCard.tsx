// ---------------------------------------------------------------------------
// ToolCallCard — progressive execution object in the conversation timeline
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
  const isActive = tc.phase === 'executing' || tc.phase === 'generating' || tc.phase === 'routed' || tc.phase === 'checked'
  const isDone = tc.phase === 'completed'
  const isBlocked = tc.phase === 'blocked'
  const category = classifyToolCallCategory(tc)
  const color = STEP_COLORS[category]
  const toolName = formatToolDisplayName(tc.toolName)
  const command = extractToolCommand(tc.toolName, tc.args)
  const { stdout } = useStdout()
  const availableWidth = Math.max(18, (stdout?.columns ?? 80) - 8)

  // Breathing animation for active state
  const breathingPhase = useBreathingPhase(isActive && isLast)
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

  // Visual weight: active cards are full color, completed cards are dimmed
  const borderChar = isActive ? '┃' : '│'
  const borderDim = isDone && !tc.isError

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* ── Header: border + phase icon + tool name + command ── */}
      <Box>
        <Text color={color} dimColor={borderDim}>{borderChar} </Text>
        <Text color={color} dimColor={borderDim}>{phaseIcon} </Text>
        <Text color={color} bold={isActive} dimColor={borderDim}>{displayTitle}</Text>
        {phaseLabel && <Text dimColor> {phaseLabel}</Text>}
      </Box>

      {/* ── Reasoning: why this tool was called ── */}
      {tc.displayReason && (
        <Box>
          <Text color={color} dimColor={borderDim}>{borderChar} </Text>
          <Text dimColor italic>  ↳ {tc.displayReason}</Text>
        </Box>
      )}

      {/* ── Route badge: original → actual ── */}
      {tc.route?.wasRouted && (
        <Box>
          <Text color={color} dimColor={borderDim}>{borderChar} </Text>
          <Text color="blue">  ⤷ </Text>
          <Text dimColor>{formatToolDisplayName(tc.route.originalToolName)}</Text>
          <Text dimColor> → </Text>
          <Text dimColor={borderDim}>{toolName}</Text>
          {tc.route.reason && <Text dimColor> ({tc.route.reason})</Text>}
        </Box>
      )}

      {/* ── Safety badge ── */}
      {tc.safety && !tc.safety.allowed && (
        <Box>
          <Text color={color} dimColor={borderDim}>{borderChar} </Text>
          <Text color="red" bold>  ⛔ BLOCKED </Text>
          <Text color="red">risk:{tc.safety.riskLevel}</Text>
          {tc.safety.reason && <Text color="red" dimColor> — {tc.safety.reason}</Text>}
        </Box>
      )}
      {tc.safety && tc.safety.allowed && tc.safety.riskLevel !== 'safe' && (
        <Box>
          <Text color={color} dimColor={borderDim}>{borderChar} </Text>
          <Text color="yellow">  ⚠ risk:{tc.safety.riskLevel}</Text>
        </Box>
      )}

      {/* ── Streaming output ── */}
      {headLines.length > 0 && (
        <>
          {headLines.map((line, i) => (
            <Box key={`h-${i}`}>
              <Text color={color} dimColor={borderDim}>{borderChar} </Text>
              <Text dimColor={!isActive}>{i === 0 ? '⎿ ' : '  '}</Text>
              <Text color={tc.isError ? 'red' : undefined} dimColor={isDone && !tc.isError}>{line || ' '}</Text>
            </Box>
          ))}
          {hiddenLineCount > 0 && (
            <Box>
              <Text color={color} dimColor={borderDim}>{borderChar} </Text>
              <Text dimColor>  </Text>
              <Text color={META_COLOR}>+{hiddenLineCount} lines</Text>
            </Box>
          )}
          {tailLines.map((line, i) => (
            <Box key={`t-${i}`}>
              <Text color={color} dimColor={borderDim}>{borderChar} </Text>
              <Text dimColor={!isActive}>  </Text>
              <Text color={tc.isError ? 'red' : undefined} dimColor={isDone && !tc.isError}>{line || ' '}</Text>
            </Box>
          ))}
        </>
      )}

      {/* ── Completion footer ── */}
      {tc.completedAt && (
        <Box>
          <Text color={color} dimColor={borderDim}>{borderChar} </Text>
          <Text color={tc.isError ? 'red' : 'green'} dimColor={!tc.isError}>
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
