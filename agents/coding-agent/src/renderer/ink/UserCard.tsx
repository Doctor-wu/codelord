// ---------------------------------------------------------------------------
// UserCard — user lane display
// ---------------------------------------------------------------------------

import { Box, Text } from 'ink'
import type { UserItem } from './timeline-projection.js'
import { LANE, GLYPH } from './theme.js'

export function UserCard({ item }: { item: UserItem }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color={LANE.user}>{GLYPH.userMark} </Text>
        <Text color={LANE.user} bold>YOU</Text>
      </Box>
      <Box>
        <Text color={LANE.userMuted}>{GLYPH.userMark} </Text>
        <Text>{item.content}</Text>
      </Box>
    </Box>
  )
}
