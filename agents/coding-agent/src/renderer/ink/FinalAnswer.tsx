// ---------------------------------------------------------------------------
// FinalAnswer — rendered after agent completes (success or error)
// ---------------------------------------------------------------------------

import { Box, Text } from 'ink'

interface FinalAnswerProps {
  answer: string | null
  error: string | null
}

export function FinalAnswer({ answer, error }: FinalAnswerProps) {
  if (error) {
    return (
      <Box marginTop={1}>
        <Text color="red" bold>Error: </Text>
        <Text color="red">{error}</Text>
      </Box>
    )
  }

  if (answer) {
    return (
      <Box marginTop={1} flexDirection="column">
        <Text>{answer}</Text>
      </Box>
    )
  }

  return null
}
