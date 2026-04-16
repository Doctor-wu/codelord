// ---------------------------------------------------------------------------
// QuestionCard — control-layer prompt for pending user questions
// ---------------------------------------------------------------------------

import { Box, Text, useStdout } from 'ink'
import type { QuestionItem } from './timeline-projection.js'
import { LANE, GLYPH } from './theme.js'

interface QuestionCardProps {
  item: QuestionItem
}

export function QuestionCard({ item }: QuestionCardProps) {
  const detail = item.detail
  const { stdout } = useStdout()
  const width = Math.max(30, (stdout?.columns ?? 80) - 4)

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* ── Control header ── */}
      <Box>
        <Text color={LANE.control}>{GLYPH.thickRule.repeat(Math.min(40, width))}</Text>
      </Box>
      <Box>
        <Text color={LANE.control} bold>
          {GLYPH.live} AWAITING INPUT
        </Text>
      </Box>

      {/* ── Question ── */}
      <Box paddingLeft={2}>
        <Text color={LANE.control} bold>
          {item.question}
        </Text>
      </Box>

      {/* ── Why asking ── */}
      {detail?.whyAsk && (
        <Box paddingLeft={2}>
          <Text dimColor italic>
            {GLYPH.settled} {detail.whyAsk}
          </Text>
        </Box>
      )}

      {/* ── Options ── */}
      {detail?.options && detail.options.length > 0 && (
        <Box flexDirection="column" paddingLeft={2}>
          {detail.options.map((opt, i) => (
            <Box key={i}>
              <Text color={LANE.control}> {GLYPH.settled} </Text>
              <Text>{opt}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* ── Expected format ── */}
      {detail?.expectedAnswerFormat && (
        <Box paddingLeft={2}>
          <Text dimColor>format: {detail.expectedAnswerFormat}</Text>
        </Box>
      )}

      {/* ── Default plan ── */}
      {detail?.defaultPlanIfNoAnswer && (
        <Box paddingLeft={2}>
          <Text dimColor>default: {detail.defaultPlanIfNoAnswer}</Text>
        </Box>
      )}

      <Box>
        <Text color={LANE.control}>{GLYPH.thickRule.repeat(Math.min(40, width))}</Text>
      </Box>
    </Box>
  )
}
