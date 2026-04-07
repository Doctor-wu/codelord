// ---------------------------------------------------------------------------
// Footer — status + model + reasoning + telemetry strip
// ---------------------------------------------------------------------------

import { Box, Text, useStdout } from 'ink'
import type { TimelineState } from './timeline-projection.js'
import type { SessionMode } from './InputComposer.js'
import { GLYPH, LANE } from './theme.js'
import { getProviderBrand } from './theme.js'

interface FooterProps {
  state: TimelineState
  provider: string
  model: string
  reasoningLevel: string
  sessionMode: SessionMode
  isRunning: boolean
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${minutes}m${remaining}s`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatCost(n: number): string {
  if (n === 0) return '$0'
  if (n < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}

function resolveStatus(isRunning: boolean, mode: SessionMode): { color: string; icon: string; label: string } {
  if (isRunning) return { color: 'green', icon: GLYPH.phaseActive, label: 'LIVE' }
  switch (mode) {
    case 'waiting_answer':
      return { color: LANE.control, icon: GLYPH.live, label: 'YOUR TURN' }
    case 'error':
      return { color: LANE.error, icon: GLYPH.phaseFail, label: 'ERROR' }
    case 'idle':
    default:
      return { color: LANE.muted, icon: GLYPH.phaseDim, label: 'IDLE' }
  }
}

export function Footer({ state, provider, model, reasoningLevel, sessionMode, isRunning }: FooterProps) {
  const { stdout } = useStdout()
  const cols = Math.max(40, (stdout?.columns ?? 80) - 1)
  const elapsed = Date.now() - state.startTime
  const usage = state.usage
  const { color: statusColor, icon: statusIcon, label: statusLabel } = resolveStatus(isRunning, sessionMode)
  const brand = getProviderBrand(provider)

  return (
    <Box flexDirection="column">
      <Box><Text dimColor>{GLYPH.thinRule.repeat(cols)}</Text></Box>
      <Box justifyContent="space-between">
        <Box>
          <Text color={statusColor}>{statusIcon} {statusLabel}</Text>
        </Box>

        <Box gap={1}>
          <Text color={brand.color}>{brand.symbol} {model}</Text>
          <Text dimColor>{GLYPH.thinRule}</Text>
          <Text dimColor>reasoning:{reasoningLevel}</Text>
        </Box>

        <Box gap={2}>
          {usage && usage.totalTokens > 0 && (
            <Text dimColor>{formatTokens(usage.totalTokens)} tok</Text>
          )}
          {usage && usage.cost.total > 0 && (
            <Text dimColor>{formatCost(usage.cost.total)}</Text>
          )}
          <Text dimColor>{formatElapsed(elapsed)}</Text>
        </Box>
      </Box>
    </Box>
  )
}
