// ---------------------------------------------------------------------------
// App — top-level Ink component, production-grade conversation timeline
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
import { summarizeThought } from './summarize.js'

interface AppProps {
  state: TimelineState
  version: string
  provider: string
  model: string
  maxSteps: number
  /** Whether the input composer is active */
  inputActive?: boolean
  /** Called when user submits input */
  onInputSubmit?: (text: string) => void
}

export function App({ state, version, provider, model, maxSteps, inputActive, onInputSubmit }: AppProps) {
  // Derive session mode for the composer
  const sessionMode = deriveSessionMode(state)

  return (
    <Box flexDirection="column">
      <Header
        version={version}
        provider={provider}
        model={model}
        isRunning={state.isRunning}
      />

      {/* Timeline items */}
      {state.items.map((item, index) => (
        <TimelineItemView key={item.id} item={item} isLast={index === state.items.length - 1} />
      ))}

      {/* Status bar */}
      <TimelineStatusBar state={state} maxSteps={maxSteps} />

      {/* Input composer — always rendered in REPL mode */}
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
// Conversation layer: user + assistant
// ---------------------------------------------------------------------------

function UserItemView({ item }: { item: UserItem }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color="cyan" bold>YOU</Text>
      </Box>
      <Box paddingLeft={2}>
        <Text>{item.content}</Text>
      </Box>
    </Box>
  )
}

function AssistantItemView({ item }: { item: AssistantItem }) {
  if (!item.thinking && !item.text && !item.reasoningSnapshot) return null

  // Reasoning lane content — stable, not fleeting
  // Priority: projectDisplayReason > reasoningSnapshot > summarizeThought
  const reasoningLine = item.reasoning ? projectDisplayReason(item.reasoning) : null
  const stableReasoning = reasoningLine || item.reasoningSnapshot || (item.thinking ? summarizeThought(item.thinking) : null)

  // Show reasoning lane when:
  // 1. Streaming and no text yet (thinking phase) — always show
  // 2. Streaming with text (acting phase) — show as stable context strip
  // 3. Not streaming but has reasoning — show as completed context
  const hasReasoning = !!stableReasoning
  const isThinkingPhase = item.isStreaming && !item.text
  const showReasoningLane = hasReasoning

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* ── Reasoning lane — stable cognitive context strip ── */}
      {showReasoningLane && (
        <Box>
          <Text color="gray">{isThinkingPhase ? '◐ ' : '◑ '}</Text>
          <Text dimColor italic>{stableReasoning}</Text>
        </Box>
      )}

      {/* ── Assistant text — the primary content ── */}
      {item.text && (
        <Box>
          <Text>{item.text}</Text>
        </Box>
      )}
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Control layer: status
// ---------------------------------------------------------------------------

function StatusItemView({ item }: { item: StatusItem }) {
  if (item.status === 'error') {
    return (
      <Box marginTop={1}>
        <Text color="red" bold>✗ Error: </Text>
        <Text color="red">{item.message}</Text>
      </Box>
    )
  }
  if (item.status === 'interrupted') {
    return (
      <Box marginTop={1}>
        <Text color="yellow" bold>⏸ </Text>
        <Text color="yellow">Agent paused</Text>
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
