// ---------------------------------------------------------------------------
// ToolCallCard — live execution object in the operator console
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from 'react'
import { Box, Text, useStdout } from 'ink'
import type { ToolCallItem } from './timeline-projection.js'
import type { ToolCallLifecycle } from '@codelord/core'
import { classifyCommand, classifyToolName } from './classify.js'
import { STEP_COLORS, META_COLOR, GLYPH, LANE } from './theme.js'
import type { StepCategory } from './theme.js'
import { formatToolDisplayName, extractToolCommand, derivePhaseFeedback } from '../tool-display.js'
import { normalizeInline, getDisplayWidth, formatToolResultLines, sanitizeOperatorHint } from './summarize.js'

interface ToolCallCardProps {
  item: ToolCallItem
  isLast: boolean
}

export function ToolCallCard({ item, isLast }: ToolCallCardProps) {
  return <ToolCallView tc={item.toolCall} isLast={isLast} />
}

/** Reusable inner view — renders a single ToolCallLifecycle */
export function ToolCallView({
  tc,
  isLast,
  dimCompleted = false,
}: {
  tc: ToolCallLifecycle
  isLast: boolean
  dimCompleted?: boolean
}) {
  const isActive =
    tc.phase === 'executing' || tc.phase === 'generating' || tc.phase === 'routed' || tc.phase === 'checked'
  const isDone = tc.phase === 'completed'
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
  const displayTitle =
    getDisplayWidth(titleLine) <= maxTitleWidth
      ? titleLine
      : `${toolName}(${normalizedCommand.slice(0, maxTitleWidth - toolName.length - 3)}…)`

  // Result display
  const displayResult = buildDisplayResult(tc)
  const { headLines, tailLines, hiddenLineCount } = formatToolResultLines(displayResult)

  // Visual weight hierarchy
  const borderChar = isActive ? GLYPH.batchActive : GLYPH.batchMid
  const borderDim = (isDone && !tc.isError) || (dimCompleted && isDone)
  const contentDim = isDone && !tc.isError
  const hasStderr = tc.phase === 'executing' && !!tc.stderr

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* ── Header: phase icon + tool name + command + phase label ── */}
      <Box>
        <Text color={color} dimColor={borderDim}>
          {borderChar}{' '}
        </Text>
        <Text color={color} dimColor={borderDim}>
          {phaseIcon}{' '}
        </Text>
        <Text color={color} bold={isActive} dimColor={borderDim}>
          {displayTitle}
        </Text>
        {phaseLabel && <Text dimColor> {phaseLabel}</Text>}
      </Box>

      {/* ── Reasoning: why this tool was called (always single-line) ── */}
      {tc.displayReason && (
        <Box>
          <Text color={color} dimColor={borderDim}>
            {borderChar}{' '}
          </Text>
          <Text dimColor italic>
            {' '}
            {GLYPH.settled} {sanitizeOperatorHint(tc.displayReason)}
          </Text>
        </Box>
      )}

      {/* ── Route badge ── */}
      {tc.route?.wasRouted && (
        <Box>
          <Text color={color} dimColor={borderDim}>
            {borderChar}{' '}
          </Text>
          <Text dimColor> routed </Text>
          <Text dimColor>{formatToolDisplayName(tc.route.originalToolName)}</Text>
          <Text dimColor>
            {' '}
            {GLYPH.thinRule}
            {'>'}{' '}
          </Text>
          <Text dimColor={borderDim}>{toolName}</Text>
          {tc.route.reason && <Text dimColor> ({tc.route.reason})</Text>}
        </Box>
      )}

      {/* ── Safety badge ── */}
      {tc.safety && !tc.safety.allowed && (
        <Box>
          <Text color={color} dimColor={borderDim}>
            {borderChar}{' '}
          </Text>
          <Text color={LANE.error} bold>
            {' '}
            {GLYPH.phaseBlocked} BLOCKED{' '}
          </Text>
          <Text color={LANE.error}>risk:{tc.safety.riskLevel}</Text>
          {tc.safety.reason && (
            <Text color={LANE.errorMuted}>
              {' '}
              {GLYPH.thinRule} {tc.safety.reason}
            </Text>
          )}
        </Box>
      )}
      {tc.safety && tc.safety.allowed && tc.safety.riskLevel !== 'safe' && (
        <Box>
          <Text color={color} dimColor={borderDim}>
            {borderChar}{' '}
          </Text>
          <Text color={LANE.control}> risk:{tc.safety.riskLevel}</Text>
        </Box>
      )}

      {/* ── Live output tail ── */}
      {headLines.length > 0 && (
        <>
          {headLines.map((line, i) => (
            <Box key={`h-${i}`}>
              <Text color={color} dimColor={borderDim}>
                {borderChar}{' '}
              </Text>
              <Text dimColor={contentDim}>{i === 0 && isActive ? GLYPH.live : ' '} </Text>
              <Text color={tc.isError ? LANE.error : undefined} dimColor={contentDim}>
                {line || ' '}
              </Text>
            </Box>
          ))}
          {hiddenLineCount > 0 && (
            <Box>
              <Text color={color} dimColor={borderDim}>
                {borderChar}{' '}
              </Text>
              <Text dimColor> </Text>
              <Text color={META_COLOR}>+{hiddenLineCount} lines</Text>
            </Box>
          )}
          {tailLines.map((line, i) => (
            <Box key={`t-${i}`}>
              <Text color={color} dimColor={borderDim}>
                {borderChar}{' '}
              </Text>
              <Text dimColor={contentDim}> </Text>
              <Text color={tc.isError ? LANE.error : undefined} dimColor={contentDim}>
                {line || ' '}
              </Text>
            </Box>
          ))}
        </>
      )}

      {/* ── Stderr (separate, highlighted) ── */}
      {hasStderr && !tc.stdout?.includes(tc.stderr) && (
        <Box>
          <Text color={color} dimColor={borderDim}>
            {borderChar}{' '}
          </Text>
          <Text color={LANE.errorMuted}>{GLYPH.live} stderr: </Text>
          <Text color={LANE.errorMuted}>{tc.stderr.split('\n')[0]}</Text>
        </Box>
      )}

      {/* ── Completion footer ── */}
      {tc.completedAt && (
        <Box>
          <Text color={color} dimColor={borderDim}>
            {borderChar}{' '}
          </Text>
          <Text color={tc.isError ? LANE.error : 'green'} dimColor={!tc.isError}>
            {tc.isError ? `${GLYPH.phaseFail} failed` : `${GLYPH.phaseDone} done`}
          </Text>
          {tc.executionStartedAt && <Text dimColor> {formatDuration(tc.completedAt - tc.executionStartedAt)}</Text>}
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
  return tc.toolName === 'bash' ? classifyCommand(tc.command) : classifyToolName(tc.toolName)
}

function getPhaseIcon(tc: ToolCallLifecycle, dimmed: boolean): string {
  if (tc.phase === 'blocked') return GLYPH.phaseBlocked
  if (tc.completedAt) return tc.isError ? GLYPH.phaseFail : GLYPH.phaseDone
  if (tc.phase === 'executing') return dimmed ? GLYPH.phaseDim : GLYPH.phasePulse
  return dimmed ? GLYPH.phaseDim : GLYPH.phaseActive
}

function getPhaseLabel(tc: ToolCallLifecycle): string | null {
  if (tc.completedAt) return null
  switch (tc.phase) {
    case 'generating':
      return 'building…'
    case 'routed':
      return 'routed'
    case 'checked':
      return 'checked'
    case 'executing': {
      if (tc.stdout || tc.stderr) return null
      // Derive tool-specific feedback for built-in tools without output yet
      return derivePhaseFeedback(tc.toolName, tc.phase, tc.args) ?? 'executing…'
    }
    case 'blocked':
      return 'blocked'
    default:
      return null
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
