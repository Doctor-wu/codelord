// ---------------------------------------------------------------------------
// QuestionCard — prominent display for pending user questions
// ---------------------------------------------------------------------------

import { Box, Text } from 'ink'
import type { QuestionItem } from './timeline-projection.js'

interface QuestionCardProps {
  item: QuestionItem
}

export function QuestionCard({ item }: QuestionCardProps) {
  const detail = item.detail

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Header */}
      <Box>
        <Text color="yellow" bold>? </Text>
        <Text color="yellow" bold>{item.question}</Text>
      </Box>

      {/* Why asking */}
      {detail?.whyAsk && (
        <Box paddingLeft={2}>
          <Text dimColor italic>↳ {detail.whyAsk}</Text>
        </Box>
      )}

      {/* Options */}
      {detail?.options && detail.options.length > 0 && (
        <Box flexDirection="column" paddingLeft={2}>
          <Text dimColor>options:</Text>
          {detail.options.map((opt, i) => (
            <Box key={i} paddingLeft={2}>
              <Text color="yellow">• </Text>
              <Text>{opt}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Expected format */}
      {detail?.expectedAnswerFormat && (
        <Box paddingLeft={2}>
          <Text dimColor>format: {detail.expectedAnswerFormat}</Text>
        </Box>
      )}

      {/* Default plan */}
      {detail?.defaultPlanIfNoAnswer && (
        <Box paddingLeft={2}>
          <Text dimColor>default: {detail.defaultPlanIfNoAnswer}</Text>
        </Box>
      )}
    </Box>
  )
}
