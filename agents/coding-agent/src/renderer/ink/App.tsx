// ---------------------------------------------------------------------------
// App — top-level Ink component, consumes TimelineState
// ---------------------------------------------------------------------------

import { Box, Text } from 'ink'
import type { TimelineState, TimelineItem, AssistantItem, ToolCallItem, UserItem, QuestionItem, StatusItem } from './timeline-projection.js'
import { Header } from './Header.js'
import { WorkingIndicator } from './WorkingIndicator.js'
import { StepTextBlock } from './StepTextBlock.js'
import { ToolCallCard } from './ToolCallCard.js'
import { TimelineStatusBar } from './TimelineStatusBar.js'
import { InputComposer } from './InputComposer.js'

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
        <TimelineItemView key={itemKey(item)} item={item} isLast={index === state.items.length - 1} />
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
        <InputComposer isActive={!!inputActive} onSubmit={onInputSubmit} />
      )}
    </Box>
  )
}

function TimelineItemView({ item, isLast }: { item: TimelineItem; isLast: boolean }) {
  switch (item.type) {
    case 'user':
      return <UserItemView item={item} />
    case 'assistant':
      return <AssistantItemView item={item} />
    case 'tool_call':
      return <ToolCallCard item={item} isLast={isLast} />
    case 'question':
      return <QuestionItemView item={item} />
    case 'status':
      return <StatusItemView item={item} />
  }
}

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

  return (
    <Box flexDirection="column" marginTop={1}>
      {item.thinking && <StepTextBlock text={item.thinking} label="thinking" />}
      {item.text && (
        <Box marginTop={item.thinking ? 1 : 0}>
          <StepTextBlock text={item.text} />
        </Box>
      )}
    </Box>
  )
}

function QuestionItemView({ item }: { item: QuestionItem }) {
  return (
    <Box marginTop={1}>
      <Text color="yellow" bold>{'? '}</Text>
      <Text color="yellow">{item.question}</Text>
    </Box>
  )
}

function StatusItemView({ item }: { item: StatusItem }) {
  if (item.status === 'error') {
    return (
      <Box marginTop={1}>
        <Text color="red" bold>Error: </Text>
        <Text color="red">{item.message}</Text>
      </Box>
    )
  }
  if (item.status === 'interrupted') {
    return (
      <Box marginTop={1}>
        <Text color="yellow" dimColor>[interrupted] {item.message}</Text>
      </Box>
    )
  }
  return null
}

function itemKey(item: TimelineItem): string {
  return item.id
}
