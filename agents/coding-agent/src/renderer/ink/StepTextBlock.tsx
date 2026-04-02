import { Box, Text } from 'ink'
import { APP_COLOR } from './theme.js'

interface StepTextBlockProps {
  text: string
  label?: string
}

export function StepTextBlock({ text, label }: StepTextBlockProps) {
  if (!text) return null

  const lines = text.split('\n')

  return (
    <Box flexDirection="column">
      {label && (
        <Box marginBottom={1}>
          <Text color={APP_COLOR} dimColor>{label}</Text>
        </Box>
      )}

      {lines.map((line, index) => (
        <Box key={index}>
          <Text>{line || ' '}</Text>
        </Box>
      ))}
    </Box>
  )
}
