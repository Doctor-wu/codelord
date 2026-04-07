// ---------------------------------------------------------------------------
// App — top-level Ink component, operator console timeline
// ---------------------------------------------------------------------------

import { Box, Text } from 'ink'
import type { TimelineState, TimelineItem, AssistantItem, ToolCallItem, ToolBatchItem, UserItem, QuestionItem, StatusItem } from './timeline-projection.js'
import type { ResumeContext } from './timeline-projection.js'
import { Header } from './Header.js'
import { ToolCallCard } from './ToolCallCard.js'
import { ToolBatchCard } from './ToolBatchCard.js'
import { QuestionCard } from './QuestionCard.js'
import { TimelineStatusBar } from './TimelineStatusBar.js'
import { InputComposer } from './InputComposer.js'
import type { SessionMode } from './InputComposer.js'
import { projectDisplayReason } from '@agent/core'
import type { ReasoningStatus } from '@agent/core'
import { summarizeThought, extractThoughtViewport } from './summarize.js'
import { LANE, GLYPH } from './theme.js'

interface AppProps {
  state: TimelineState
  version: string
  provider: string
  model: string
  maxSteps: number
  inputActive?: boolean
  onInputSubmit?: (text: string) => void
  onInterrupt?: () => void
  onExit?: () => void
  /** Messages queued during running */
  pendingQueue?: string[]
  /** Whether the agent is currently running */
  isRunning?: boolean
}

export function App({ state, version, provider, model, maxSteps, inputActive, onInputSubmit, onInterrupt, onExit, pendingQueue, isRunning }: AppProps) {
  const sessionMode = deriveSessionMode(state)
  const queueCount = pendingQueue?.length ?? 0

  return (
    <Box flexDirection="column">
      <Header
        version={version}
        provider={provider}
        model={model}
        isRunning={state.isRunning}
        sessionMode={sessionMode}
        queueCount={queueCount}
      />

      {state.items.map((item, index) => (
        <TimelineItemView key={item.id} item={item} isLast={index === state.items.length - 1} />
      ))}

      {onInputSubmit && (
        <InputComposer
          isActive={!!inputActive}
          onSubmit={onInputSubmit}
          onInterrupt={onInterrupt}
          onExit={onExit}
          mode={sessionMode}
          pendingQueue={pendingQueue ?? []}
          isRunning={!!isRunning}
        />
      )}

      <TimelineStatusBar state={state} maxSteps={maxSteps} />
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
        <Text color={LANE.userMuted}>{GLYPH.userMark} </Text>
        <Text>{item.content}</Text>
      </Box>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Assistant lane — text + stable reasoning strip
// ---------------------------------------------------------------------------

function AssistantItemView({ item }: { item: AssistantItem }) {
  if (!item.thinking && !item.text && !item.reasoningSnapshot && !item.liveProxy) return null

  const reasoningStatus = item.reasoning?.status ?? 'thinking'

  // --- Two distinct display modes ---

  // Mode A: Provider has real thought → rolling viewport
  if (item.hasProviderThought && item.thinking) {
    if (item.isStreaming) {
      // Live streaming: show rolling viewport of latest 5 lines
      const viewportLines = extractThoughtViewport(item.thinking, 5)
      return (
        <Box flexDirection="column" marginTop={1}>
          {viewportLines.map((line, i) => (
            <Box key={i}>
              <Text color={LANE.reasoningMuted}>{GLYPH.reasoningMark} </Text>
              {i === 0 && <Text color={LANE.reasoning}>{getReasoningIcon(reasoningStatus, true)} </Text>}
              {i > 0 && <Text color={LANE.reasoning}>  </Text>}
              <Text color={LANE.reasoning} italic>{line || ' '}</Text>
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
    // Settled: preserve viewport-level readability, just change the icon
    const viewportLines = extractThoughtViewport(item.thinking, 5)
    return (
      <Box flexDirection="column" marginTop={1}>
        {viewportLines.map((line, i) => (
          <Box key={i}>
            <Text color={LANE.reasoningMuted}>{GLYPH.reasoningMark} </Text>
            {i === 0 && <Text color={LANE.reasoning}>{GLYPH.settled} </Text>}
            {i > 0 && <Text color={LANE.reasoning}>  </Text>}
            <Text color={LANE.reasoning} italic dimColor>{line || ' '}</Text>
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

// ---------------------------------------------------------------------------
// Control layer: status items
// ---------------------------------------------------------------------------

function StatusItemView({ item }: { item: StatusItem }) {
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
  if (item.status === 'interrupted') {
    return (
      <Box marginTop={1}>
        <Text color={LANE.control} bold>{GLYPH.phaseBlocked} PAUSED </Text>
        <Text color={LANE.controlMuted}>Agent execution suspended</Text>
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

  // Resume context: if reconciliation tagged this as a resumed session,
  // surface the appropriate mode even when timeline items look like idle
  const rc = state.resumeContext
  if (rc?.isResumed) {
    if (rc.hasPendingQuestion) return 'waiting_answer'
    if (rc.wasDowngraded) return 'interrupted'
  }

  return 'idle'
}
