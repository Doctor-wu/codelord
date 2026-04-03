// ---------------------------------------------------------------------------
// App — top-level Ink component, operator console timeline
// ---------------------------------------------------------------------------

import { Box, Text } from 'ink'
import type { TimelineState, TimelineItem, AssistantItem, ToolCallItem, ToolBatchItem, UserItem, QuestionItem, StatusItem } from './timeline-projection.js'
import { Header } from './Header.js'
import { ToolCallCard } from './ToolCallCard.js'
import { ToolBatchCard } from './ToolBatchCard.js'
import { QuestionCard } from './QuestionCard.js'
import { TimelineStatusBar } from './TimelineStatusBar.js'
import { InputComposer } from './InputComposer.js'
import type { SessionMode } from './InputComposer.js'
import { projectDisplayReason } from '@agent/core'
import type { ReasoningStatus } from '@agent/core'
import { summarizeThought } from './summarize.js'
import { LANE, GLYPH } from './theme.js'

interface AppProps {
  state: TimelineState
  version: string
  provider: string
  model: string
  maxSteps: number
  inputActive?: boolean
  onInputSubmit?: (text: string) => void
}

export function App({ state, version, provider, model, maxSteps, inputActive, onInputSubmit }: AppProps) {
  const sessionMode = deriveSessionMode(state)

  return (
    <Box flexDirection="column">
      <Header
        version={version}
        provider={provider}
        model={model}
        isRunning={state.isRunning}
      />

      {state.items.map((item, index) => (
        <TimelineItemView key={item.id} item={item} isLast={index === state.items.length - 1} />
      ))}

      <TimelineStatusBar state={state} maxSteps={maxSteps} />

      {onInputSubmit && (
        <InputComposer
          isActive={!!inputActive}
          onSubmit={onInputSubmit}
          mode={sessionMode}
        />
      )}
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Timeline item dispatch
// ---------------------------------------------------------------------------

function TimelineItemView({ item, isLast }: { item: TimelineItem; isLast: boolean }) {
  switch (item.type) {
    case 'user':
      return <UserItemView item={item} />
    case 'assistant':
      return <AssistantItemView item={item} />
    case 'tool_call':
      return <ToolCallCard item={item} isLast={isLast} />
    case 'tool_batch':
      return <ToolBatchCard item={item} isLast={isLast} />
    case 'question':
      return <QuestionCard item={item} />
    case 'status':
      return <StatusItemView item={item} />
  }
}

// ---------------------------------------------------------------------------
// User lane — strong identity track
// ---------------------------------------------------------------------------

function UserItemView({ item }: { item: UserItem }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color={LANE.user}>{GLYPH.userMark} </Text>
        <Text color={LANE.user} bold>YOU</Text>
      </Box>
      <Box>
        <Text color={LANE.userDim}>{GLYPH.userMark} </Text>
        <Text>{item.content}</Text>
      </Box>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Assistant lane — text + stable reasoning strip
// ---------------------------------------------------------------------------

function AssistantItemView({ item }: { item: AssistantItem }) {
  if (!item.thinking && !item.text && !item.reasoningSnapshot) return null

  const reasoningLine = item.reasoning ? projectDisplayReason(item.reasoning) : null
  const stableReasoning = reasoningLine || item.reasoningSnapshot || (item.thinking ? summarizeThought(item.thinking) : null)
  const hasReasoning = !!stableReasoning
  const reasoningStatus = item.reasoning?.status ?? 'thinking'

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* ── Reasoning lane — stable cognitive strip ── */}
      {hasReasoning && (
        <Box>
          <Text color={LANE.reasoning}>{GLYPH.reasoningMark} </Text>
          <Text color={LANE.reasoning}>{getReasoningIcon(reasoningStatus, item.isStreaming)} </Text>
          <Text color={LANE.reasoning} italic>{stableReasoning}</Text>
        </Box>
      )}

      {/* ── Assistant text ── */}
      {item.text && (
        <Box>
          <Text color={LANE.assistant}>{GLYPH.assistantMark} </Text>
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

// ---------------------------------------------------------------------------
// Control layer: status items
// ---------------------------------------------------------------------------

function StatusItemView({ item }: { item: StatusItem }) {
  if (item.status === 'error') {
    return (
      <Box marginTop={1}>
        <Text color="red" bold>{GLYPH.phaseFail} ERROR </Text>
        <Text color="red">{item.message}</Text>
      </Box>
    )
  }
  if (item.status === 'interrupted') {
    return (
      <Box marginTop={1}>
        <Text color={LANE.control} bold>{GLYPH.phaseBlocked} PAUSED </Text>
        <Text color={LANE.controlDim}>Agent execution suspended</Text>
      </Box>
    )
  }
  return null
}

// ---------------------------------------------------------------------------
// Session mode derivation
// ---------------------------------------------------------------------------

function deriveSessionMode(state: TimelineState): SessionMode {
  if (state.isRunning) return 'running'

  const lastItem = state.items[state.items.length - 1]
  if (lastItem?.type === 'question') return 'waiting_answer'
  if (lastItem?.type === 'status') {
    if ((lastItem as StatusItem).status === 'interrupted') return 'interrupted'
    if ((lastItem as StatusItem).status === 'error') return 'error'
  }

  return 'idle'
}
