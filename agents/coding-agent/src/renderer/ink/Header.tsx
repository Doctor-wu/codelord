// ---------------------------------------------------------------------------
// Header — mission console header bar
// ---------------------------------------------------------------------------

import { Box, Text, useStdout } from 'ink'
import { APP_NAME, APP_COLOR, getProviderBrand, GLYPH, LANE } from './theme.js'
import type { SessionMode } from './InputComposer.js'

interface HeaderProps {
  version: string
  provider: string
  model: string
  isRunning: boolean
  sessionMode?: SessionMode
  queueCount?: number
}

export function Header({ version, provider, model, isRunning, sessionMode = 'idle', queueCount = 0 }: HeaderProps) {
  const { stdout } = useStdout()
  const brand = getProviderBrand(provider)
  const cols = Math.max(40, (stdout?.columns ?? 80) - 1)

  const { color: statusColor, icon: statusIcon, label: statusLabel } = resolveHeaderStatus(isRunning, sessionMode, queueCount)

  return (
    <Box flexDirection="column">
      {/* ── Header content ── */}
      <Box justifyContent="space-between">
        <Box>
          <Text color={APP_COLOR} bold>{APP_NAME}</Text>
          <Text dimColor> v{version}</Text>
          <Text dimColor>  </Text>
          <Text color={brand.color}>{brand.symbol} {model}</Text>
        </Box>

        <Box>
          <Text color={statusColor}>{statusIcon} </Text>
          <Text color={statusColor}>{statusLabel}</Text>
          {queueCount > 0 && sessionMode !== 'idle' && (
            <Text color={LANE.user}> {queueCount}q</Text>
          )}
        </Box>
      </Box>

      <Text dimColor>{GLYPH.thinRule.repeat(cols)}</Text>
    </Box>
  )
}

function resolveHeaderStatus(isRunning: boolean, mode: SessionMode, queueCount: number): { color: string; icon: string; label: string } {
  if (isRunning) {
    return { color: 'green', icon: GLYPH.phaseActive, label: 'LIVE' }
  }

  switch (mode) {
    case 'waiting_answer':
      return { color: LANE.control, icon: GLYPH.live, label: 'YOUR TURN' }
    case 'error':
      return { color: LANE.error, icon: GLYPH.phaseFail, label: 'ERROR' }
    case 'running':
      return { color: 'green', icon: GLYPH.phaseActive, label: 'LIVE' }
    case 'idle':
    default:
      return { color: LANE.muted, icon: GLYPH.phaseDim, label: 'IDLE' }
  }
}
