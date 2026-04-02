import React, { useEffect, useState } from 'react'
import { Box, Text, useStdout } from 'ink'
import type { ToolCallState } from './state.js'
import { classifyToolCall } from './classify.js'
import { STEP_COLORS } from './theme.js'
import { getDisplayWidth, normalizeInline } from './summarize.js'
import { formatToolDisplayName } from '../tool-display.js'

interface ToolCallLineProps {
  toolCall: ToolCallState
  isRunning?: boolean
}

interface ToolTitleLine {
  text: string
  highlightsToolName: boolean
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

export function ToolCallLine({ toolCall, isRunning = false }: ToolCallLineProps) {
  const { stdout } = useStdout()
  const category = classifyToolCall(toolCall)
  const color = STEP_COLORS[category]
  const toolName = formatToolDisplayName(toolCall.name)
  const availableWidth = Math.max(18, (stdout?.columns ?? 80) - 12)
  const titleLines = formatToolTitleLines({
    toolName,
    command: toolCall.command,
    availableWidth,
    isRunning,
  })
  const breathingPhase = useBreathingPhase(isRunning)
  const isPulseDimmed = breathingPhase >= 2

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={color}>{'\u2503'} </Text>
        <Text color={color} bold>{category.toUpperCase()}</Text>
      </Box>

      {titleLines.map((line, index) => (
        <Box key={index}>
          <Text color={color}>{'\u2503'} </Text>
          {line.highlightsToolName
            ? (
                <>
                  {isRunning && (
                    <>
                      <Text color={color} dimColor={isPulseDimmed}>{'\u25CF'}</Text>
                      <Text> </Text>
                    </>
                  )}
                  <Text bold>{toolName}</Text>
                  <Text>{line.text.slice(toolName.length)}</Text>
                </>
              )
            : <Text>{line.text}</Text>}
        </Box>
      ))}
    </Box>
  )
}

export function formatToolTitleLines(options: {
  toolName: string
  command: string
  availableWidth: number
  isRunning: boolean
}): ToolTitleLine[] {
  const toolName = options.toolName
  const normalizedCommand = normalizeInline(options.command)
  const lineWidth = Math.max(8, options.availableWidth)
  const firstLineWidth = Math.max(8, lineWidth - (options.isRunning ? 2 : 0))
  const prefix = `${toolName}(`
  const suffix = ')'
  const singleLine = `${prefix}${normalizedCommand}${suffix}`

  if (getDisplayWidth(singleLine) <= firstLineWidth) {
    return [{ text: singleLine, highlightsToolName: true }]
  }

  const firstCommandWidth = Math.max(1, firstLineWidth - getDisplayWidth(prefix))
  const firstSegment = sliceAtWordBoundary(normalizedCommand, firstCommandWidth)
  const remaining = normalizedCommand.slice(firstSegment.length).trimStart()
  const secondLine = truncateWithEllipsis(`${remaining}${suffix}`, lineWidth)

  return [
    { text: `${prefix}${firstSegment}`, highlightsToolName: true },
    { text: secondLine, highlightsToolName: false },
  ]
}

function sliceAtWordBoundary(text: string, maxWidth: number): string {
  if (getDisplayWidth(text) <= maxWidth) return text

  let width = 0
  let result = ''

  for (const char of text) {
    const charWidth = getDisplayWidth(char)
    if (width + charWidth > maxWidth) break
    result += char
    width += charWidth
  }

  const breakIndex = result.lastIndexOf(' ')
  if (breakIndex > 0) {
    return result.slice(0, breakIndex).trimEnd()
  }

  return result.trimEnd()
}

function truncateWithEllipsis(text: string, maxWidth: number): string {
  if (getDisplayWidth(text) <= maxWidth) return text

  let width = 0
  let result = ''
  for (const char of text) {
    const charWidth = getDisplayWidth(char)
    if (width + charWidth + 1 > maxWidth) break
    result += char
    width += charWidth
  }

  return result.trimEnd() + '\u2026'
}
