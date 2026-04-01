import { Box, Text } from 'ink'

interface StepTextBlockProps {
  text: string
}

export function StepTextBlock({ text }: StepTextBlockProps) {
  if (!text) return null

  const lines = text.split('\n')

  return (
    <Box flexDirection="column">
      {lines.map((line, index) => (
        <Box key={index}>
          <Text>{line || ' '}</Text>
        </Box>
      ))}
    </Box>
  )
}
