import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import { APP_COLOR } from './theme.js'

export function WorkingIndicator() {
  return (
    <Box>
      <Text color={APP_COLOR}>
        <Spinner type="dots" />
      </Text>
      <Text> </Text>
      <Text color={APP_COLOR} bold>thinking</Text>
    </Box>
  )
}
