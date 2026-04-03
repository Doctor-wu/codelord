// ---------------------------------------------------------------------------
// Timeline Projection — reduces LifecycleEvents into a stable view model
// ---------------------------------------------------------------------------

import type { LifecycleEvent, ToolCallLifecycle, AssistantReasoningState } from '@agent/core'

// ---------------------------------------------------------------------------
// Timeline item types
// ---------------------------------------------------------------------------

export interface UserItem {
  type: 'user'
  id: string
  content: string
  timestamp: number
}

export interface AssistantItem {
  type: 'assistant'
  id: string
  thinking: string
  text: string
  isStreaming: boolean
  reasoning: AssistantReasoningState | null
  timestamp: number
}

export interface ToolCallItem {
  type: 'tool_call'
  id: string
  toolCall: ToolCallLifecycle
}

export interface QuestionItem {
  type: 'question'
  id: string
  question: string
  reasoning: AssistantReasoningState | null
  timestamp: number
}

export interface StatusItem {
  type: 'status'
  id: string
  status: 'running' | 'idle' | 'interrupted' | 'done' | 'error'
  message?: string
  timestamp: number
}

export type TimelineItem =
  | UserItem
  | AssistantItem
  | ToolCallItem
  | QuestionItem
  | StatusItem

// ---------------------------------------------------------------------------
// TimelineState — the complete view model for Ink
// ---------------------------------------------------------------------------

export interface TimelineState {
  items: TimelineItem[]
  isRunning: boolean
  isIdle: boolean
  startTime: number
  /** Monotonic counter for generating stable item ids */
  _nextId: number
}

export function createInitialTimelineState(idle = false): TimelineState {
  return {
    items: [],
    isRunning: !idle,
    isIdle: idle,
    startTime: Date.now(),
    _nextId: 0,
  }
}

// ---------------------------------------------------------------------------
// Reducer — processes lifecycle events into timeline state
// ---------------------------------------------------------------------------

export function reduceLifecycleEvent(state: TimelineState, event: LifecycleEvent): TimelineState {
  switch (event.type) {
    case 'user_turn':
      return {
        ...state,
        isIdle: false,
        isRunning: true,
        items: [...state.items, {
          type: 'user',
          id: event.id,
          content: event.content,
          timestamp: event.timestamp,
        }],
      }

    case 'assistant_turn_start':
      return {
        ...state,
        items: [...state.items, {
          type: 'assistant',
          id: event.id,
          thinking: '',
          text: '',
          isStreaming: true,
          reasoning: event.reasoning ?? null,
          timestamp: event.timestamp,
        }],
      }

    case 'assistant_turn_end': {
      const items = [...state.items]
      const idx = findLastIndex(items, i => i.type === 'assistant' && i.id === event.id)
      if (idx !== -1) {
        items[idx] = { ...(items[idx] as AssistantItem), isStreaming: false, reasoning: event.reasoning ?? (items[idx] as AssistantItem).reasoning }
      }
      return { ...state, items }
    }

    case 'tool_call_created':
    case 'tool_call_updated':
    case 'tool_call_completed': {
      const items = [...state.items]
      const idx = findLastIndex(items, i => i.type === 'tool_call' && i.id === event.toolCall.id)
      const item: ToolCallItem = {
        type: 'tool_call',
        id: event.toolCall.id,
        toolCall: event.toolCall,
      }
      if (idx !== -1) {
        items[idx] = item
      } else {
        items.push(item)
      }
      return { ...state, items }
    }

    case 'blocked_enter': {
      const items = [...state.items]
      const nextId = state._nextId + 1
      if (event.reason === 'waiting_user' && event.question) {
        items.push({
          type: 'question',
          id: `question-${nextId}`,
          question: event.question,
          reasoning: event.reasoning ?? null,
          timestamp: event.timestamp,
        })
      } else if (event.reason === 'interrupted') {
        items.push({
          type: 'status',
          id: `status-${nextId}`,
          status: 'interrupted',
          message: 'Agent paused',
          timestamp: event.timestamp,
        })
      }
      return { ...state, items, isRunning: false, _nextId: nextId }
    }

    case 'blocked_exit':
      return { ...state, isRunning: true }

    case 'session_done': {
      const nextId = state._nextId + 1
      return {
        ...state,
        isRunning: false,
        _nextId: nextId,
        // For success: text is already rendered in the AssistantItem — don't duplicate.
        // For error: show the error message in a status item.
        items: event.success
          ? state.items
          : [...state.items, {
              type: 'status' as const,
              id: `status-${nextId}`,
              status: 'error' as const,
              message: event.error,
              timestamp: event.timestamp,
            }],
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Raw stream integration — update assistant thinking/text from raw events
// ---------------------------------------------------------------------------

export function applyThinkingDelta(state: TimelineState, delta: string): TimelineState {
  const items = [...state.items]
  const idx = findLastIndex(items, i => i.type === 'assistant' && (i as AssistantItem).isStreaming)
  if (idx !== -1) {
    const item = items[idx] as AssistantItem
    items[idx] = { ...item, thinking: item.thinking + delta }
  }
  return { ...state, items }
}

export function applyTextDelta(state: TimelineState, delta: string): TimelineState {
  const items = [...state.items]
  const idx = findLastIndex(items, i => i.type === 'assistant' && (i as AssistantItem).isStreaming)
  if (idx !== -1) {
    const item = items[idx] as AssistantItem
    items[idx] = { ...item, text: item.text + delta }
  }
  return { ...state, items }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i]!)) return i
  }
  return -1
}
