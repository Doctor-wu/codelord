// ---------------------------------------------------------------------------
// App — top-level Ink component, production-grade conversation timeline
// ---------------------------------------------------------------------------

import { Box, Text } from 'ink'
import type { TimelineState, TimelineItem, AssistantItem, ToolCallItem, UserItem, QuestionItem, StatusItem } from './timeline-projection.js'
import { Header } from './Header.js'
import { WorkingIndicator } from './WorkingIndicator.js'
import { ToolCallCard } from './ToolCallCard.js'
import { QuestionCard } from './QuestionCard.js'
import { TimelineStatusBar } from './TimelineStatusBar.js'
import { InputComposer } from './InputComposer.js'
import type { SessionMode } from './InputComposer.js'
import { projectDisplayReason } from '@agent/core'

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
  const lastItem = state.items[state.items.length - 1]
  const isStreaming = lastItem?.type === 'assistant' && (lastItem as AssistantItem).isStreaming

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

      {/* Working indicator when running but no content yet */}
      {state.isRunning && !state.isIdle && state.items.length === 0 && (
        <WorkingIndicator />
      )}

      {/* Working indicator when streaming assistant with no visible content */}
      {state.isRunning && isStreaming && !(lastItem as AssistantItem).thinking && !(lastItem as AssistantItem).text && (
        <WorkingIndicator />
      )}

      {/* Status bar */}
      <TimelineStatusBar state={state} maxSteps={maxSteps} />

      {/* Input composer (REPL mode) */}
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
    <Box marginTop={1}>
      <Text color="cyan" bold>{'> '}</Text>
      <Text>{item.content}</Text>
    </Box>
  )
}

function AssistantItemView({ item }: { item: AssistantItem }) {
  if (!item.thinking && !item.text) return null

  // Lightweight reasoning projection: show intent/why as a subtle line
  const reasoningSummary = item.reasoning ? projectDisplayReason(item.reasoning) : null
  const showReasoning = reasoningSummary && !item.text && item.thinking

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Reasoning intent (only while thinking, before text arrives) */}
      {showReasoning && (
        <Box>
          <Text dimColor italic>↳ {reasoningSummary}</Text>
        </Box>
      )}

      {/* Thinking block */}
      {item.thinking && (
        <Box flexDirection="column">
          <Text dimColor italic>thinking</Text>
          <Box paddingLeft={2}>
            <Text dimColor>{item.thinking}</Text>
          </Box>
        </Box>
      )}

      {/* Assistant text */}
      {item.text && (
        <Box marginTop={item.thinking ? 1 : 0}>
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

  // Check the last item for blocked states
  const lastItem = state.items[state.items.length - 1]
  if (lastItem?.type === 'question') return 'waiting_answer'
  if (lastItem?.type === 'status') {
    if ((lastItem as StatusItem).status === 'interrupted') return 'interrupted'
    if ((lastItem as StatusItem).status === 'error') return 'error'
  }

  return 'idle'
}
