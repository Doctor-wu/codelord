// ---------------------------------------------------------------------------
// StatusCard — control layer status items
// ---------------------------------------------------------------------------

import { Box, Text } from 'ink'
import type { StatusItem } from './timeline-projection.js'
import { LANE, GLYPH } from './theme.js'

export function StatusCard({ item }: { item: StatusItem }) {
  if (item.status === 'info') {
    return (
      <Box marginTop={1}>
        <Text color={LANE.control}>{item.message}</Text>
      </Box>
    )
  }
  if (item.status === 'error') {
    return (
      <Box marginTop={1}>
        <Text color={LANE.error} bold>{GLYPH.phaseFail} ERROR </Text>
        <Text color={LANE.error}>{item.message}</Text>
      </Box>
    )
  }
  return null
}
