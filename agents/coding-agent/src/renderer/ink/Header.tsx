// ---------------------------------------------------------------------------
// Header — mission console header bar
// ---------------------------------------------------------------------------

import { Box, Text, useStdout } from 'ink'
import { APP_NAME, APP_COLOR, getProviderBrand, GLYPH, LANE } from './theme.js'

interface HeaderProps {
  version: string
  provider: string
  model: string
  isRunning: boolean
}

export function Header({ version, provider, model, isRunning }: HeaderProps) {
  const { stdout } = useStdout()
  const brand = getProviderBrand(provider)
  const cols = Math.max(40, (stdout?.columns ?? 80) - 1)

  // Status chip
  const statusColor = isRunning ? 'green' : LANE.muted
  const statusIcon = isRunning ? GLYPH.phaseActive : GLYPH.phaseDim
  const statusLabel = isRunning ? 'LIVE' : 'IDLE'

  return (
    <Box flexDirection="column">
      {/* ── Top rule ── */}
      <Text dimColor>{GLYPH.thickRule.repeat(cols)}</Text>

      {/* ── Header content ── */}
      <Box justifyContent="space-between">
        {/* Left: brand + version */}
        <Box>
          <Text color={APP_COLOR} bold>{APP_NAME}</Text>
          <Text dimColor> v{version}</Text>
          <Text dimColor> {GLYPH.thinRule} </Text>
          <Text color={brand.color}>{brand.symbol} {model}</Text>
        </Box>

        {/* Right: status chip */}
        <Box>
          <Text color={statusColor}>{statusIcon} </Text>
          <Text color={statusColor} bold>{statusLabel}</Text>
        </Box>
      </Box>

      {/* ── Bottom rule ── */}
      <Text dimColor>{GLYPH.thinRule.repeat(cols)}</Text>
    </Box>
  )
}
