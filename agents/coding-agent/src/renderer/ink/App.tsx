// ---------------------------------------------------------------------------
// App — top-level Ink component, operator console timeline
// ---------------------------------------------------------------------------

import { useState, useEffect } from 'react'
import { Box, useStdout } from 'ink'
import type { TimelineState, TimelineItem, StatusItem } from './timeline-projection.js'
import type { TimelineStore } from './timeline-store.js'
import type { InputBridge } from './input-bridge.js'
import { Header } from './Header.js'
import { Footer } from './Footer.js'
import { UserCard } from './UserCard.js'
import { AssistantCard } from './AssistantCard.js'
import { ToolCallCard } from './ToolCallCard.js'
import { ToolBatchCard } from './ToolBatchCard.js'
import { QuestionCard } from './QuestionCard.js'
import { StatusCard } from './StatusCard.js'
import { InputComposer } from './InputComposer.js'
import type { SessionMode } from './InputComposer.js'

export interface AppProps {
  store: TimelineStore
  inputBridge: InputBridge | null
  version: string
  cwd: string
  provider: string
  model: string
  reasoningLevel: string
}

export function App({ store, inputBridge, version, cwd, provider, model, reasoningLevel: initialReasoningLevel }: AppProps) {
  const [state, setState] = useState<TimelineState>(store.getState())
  const [inputActive, setInputActive] = useState(inputBridge?.isActive ?? false)
  const [isRunning, setIsRunning] = useState(inputBridge?.isRunning ?? false)
  const [reasoningLevel, setReasoningLevel] = useState(inputBridge?.reasoningLevel ?? initialReasoningLevel)

  useEffect(() => store.subscribe(setState), [store])

  useEffect(() => {
    if (!inputBridge) return
    setInputActive(inputBridge.isActive)
    setIsRunning(inputBridge.isRunning)
    setReasoningLevel(inputBridge.reasoningLevel)
    inputBridge.setOnChange(() => {
      setInputActive(inputBridge.isActive)
      setIsRunning(inputBridge.isRunning)
      setReasoningLevel(inputBridge.reasoningLevel)
    })
    return () => inputBridge.setOnChange(() => {})
  }, [inputBridge])

  const sessionMode = deriveSessionMode(state)
  const pendingQueue = inputBridge?.runtimeQueue?.pendingInboundPreviews ?? []

  const handleSubmit = inputBridge ? (text: string) => inputBridge.submit(text) : undefined
  const handleInterrupt = inputBridge ? () => inputBridge.interrupt() : undefined
  const handleExit = inputBridge ? () => inputBridge.exit() : undefined

  const { stdout } = useStdout()
  const termHeight = stdout?.rows ?? 24

  return (
    <Box flexDirection="column" minHeight={termHeight}>
      <Header version={version} cwd={cwd} provider={provider} model={model} reasoningLevel={reasoningLevel} />

      <Box flexDirection="column" flexGrow={1}>
        {state.items.map((item, index) => (
          <TimelineItemView key={item.id} item={item} isLast={index === state.items.length - 1} />
        ))}
      </Box>

      {handleSubmit && (
        <InputComposer
          isActive={inputActive}
          onSubmit={handleSubmit}
          onInterrupt={handleInterrupt}
          onExit={handleExit}
          mode={sessionMode}
          pendingQueue={pendingQueue}
          isRunning={isRunning}
        />
      )}

      <Footer
        state={state}
        provider={provider}
        model={model}
        reasoningLevel={reasoningLevel}
        sessionMode={sessionMode}
        isRunning={isRunning}
      />
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Timeline item dispatch
// ---------------------------------------------------------------------------

function TimelineItemView({ item, isLast }: { item: TimelineItem; isLast: boolean }) {
  switch (item.type) {
    case 'user':
      return <UserCard item={item} />
    case 'assistant':
      return <AssistantCard item={item} />
    case 'tool_call':
      return <ToolCallCard item={item} isLast={isLast} />
    case 'tool_batch':
      return <ToolBatchCard item={item} isLast={isLast} />
    case 'question':
      return <QuestionCard item={item} />
    case 'status':
      return <StatusCard item={item} />
  }
}

// ---------------------------------------------------------------------------
// Session mode derivation
// ---------------------------------------------------------------------------

function deriveSessionMode(state: TimelineState): SessionMode {
  if (state.isRunning) return 'running'

  const lastItem = state.items[state.items.length - 1]
  if (lastItem?.type === 'question') return 'waiting_answer'
  if (lastItem?.type === 'status') {
    if ((lastItem as StatusItem).status === 'error') return 'error'
  }

  const rc = state.resumeContext
  if (rc?.isResumed) {
    if (rc.hasPendingQuestion) return 'waiting_answer'
  }

  return 'idle'
}
