// ---------------------------------------------------------------------------
// AssistantCard — assistant lane with reasoning strip
// ---------------------------------------------------------------------------

import { Box, Text } from 'ink'
import type { AssistantItem } from './timeline-projection.js'
import type { ReasoningStatus } from '@agent/core'
import { projectDisplayReason } from '@agent/core'
import { summarizeThought, extractThoughtViewport } from './summarize.js'
import { LANE, GLYPH } from './theme.js'

export function AssistantCard({ item }: { item: AssistantItem }) {
  if (!item.thinking && !item.text && !item.reasoningSnapshot && !item.liveProxy) return null

  const reasoningStatus = item.reasoning?.status ?? 'thinking'

  // Mode A: Provider has real thought → rolling viewport
  if (item.hasProviderThought && item.thinking) {
    const viewportLines = extractThoughtViewport(item.thinking, 5)
    return (
      <Box flexDirection="column" marginTop={1}>
        {viewportLines.map((line, i) => (
          <Box key={i}>
            <Text color={LANE.reasoningMuted}>{GLYPH.reasoningMark} </Text>
            {i === 0 && <Text color={LANE.reasoning}>{getReasoningIcon(reasoningStatus, item.isStreaming)} </Text>}
            {i > 0 && <Text color={LANE.reasoning}>  </Text>}
            <Text color={LANE.reasoning} italic dimColor={!item.isStreaming}>{line || ' '}</Text>
          </Box>
        ))}
        {item.text && (
          <Box>
            <Text color={LANE.assistantMuted}>{GLYPH.assistantMark} </Text>
            <Text>{item.text}</Text>
          </Box>
        )}
      </Box>
    )
  }

  // Mode B: No provider thought → derived live proxy or settled fallback
  const reasoningLine = item.reasoning ? projectDisplayReason(item.reasoning) : null
  const stableReasoning = reasoningLine || item.reasoningSnapshot || (item.thinking ? summarizeThought(item.thinking) : null)
  const displayReasoning = stableReasoning || (item.isStreaming ? item.liveProxy : null)
  const hasReasoning = !!displayReasoning

  return (
    <Box flexDirection="column" marginTop={1}>
      {hasReasoning && (
        <Box>
          <Text color={LANE.reasoningMuted}>{GLYPH.reasoningMark} </Text>
          <Text color={LANE.reasoning}>{getReasoningIcon(reasoningStatus, item.isStreaming)} </Text>
          <Text color={LANE.reasoning} italic>{displayReasoning}</Text>
        </Box>
      )}
      {item.text && (
        <Box>
          <Text color={LANE.assistantMuted}>{GLYPH.assistantMark} </Text>
          <Text>{item.text}</Text>
        </Box>
      )}
    </Box>
  )
}

function getReasoningIcon(status: ReasoningStatus, isStreaming: boolean): string {
  if (!isStreaming) return GLYPH.settled
  switch (status) {
    case 'thinking': return '◐'
    case 'deciding': return '◑'
    case 'acting': return GLYPH.live
    case 'blocked': return GLYPH.phaseBlocked
    case 'completed': return GLYPH.settled
    default: return GLYPH.settled
  }
}
