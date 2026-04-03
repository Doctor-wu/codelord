// ---------------------------------------------------------------------------
// Timeline Projection — reduces LifecycleEvents into a stable view model
// ---------------------------------------------------------------------------

import type { LifecycleEvent, ToolCallLifecycle, AssistantReasoningState, QuestionDetail } from '@agent/core'

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
  /** Stable reasoning snapshot preserved after text arrives (not cleared) */
  reasoningSnapshot: string | null
  timestamp: number
}

export interface ToolCallItem {
  type: 'tool_call'
  id: string
  toolCall: ToolCallLifecycle
}

/** A batch of tool calls from the same assistant turn, produced consecutively */
export interface ToolBatchItem {
  type: 'tool_batch'
  id: string
  /** The assistant turn id this batch belongs to */
  assistantTurnId: string
  /** Ordered tool call items in this batch */
  toolCalls: ToolCallLifecycle[]
  /** Shared reasoning context for the batch (from the assistant turn) */
  reasoning: AssistantReasoningState | null
}

export interface QuestionItem {
  type: 'question'
  id: string
  question: string
  detail: QuestionDetail | null
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
  | ToolBatchItem
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
  /** Current assistant turn id — used for batch grouping */
  _currentAssistantTurnId: string | null
  /** Current open batch id — tool calls append here while the batch is open */
  _currentBatchId: string | null
}

export function createInitialTimelineState(idle = false): TimelineState {
  return {
    items: [],
    isRunning: !idle,
    isIdle: idle,
    startTime: Date.now(),
    _nextId: 0,
    _currentAssistantTurnId: null,
    _currentBatchId: null,
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
        // User turn breaks any open batch
        _currentBatchId: null,
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
        _currentAssistantTurnId: event.id,
        _currentBatchId: null,
        items: [...state.items, {
          type: 'assistant',
          id: event.id,
          thinking: '',
          text: '',
          isStreaming: true,
          reasoning: event.reasoning ?? null,
          reasoningSnapshot: null,
          timestamp: event.timestamp,
        }],
      }

    case 'assistant_turn_end': {
      const items = [...state.items]
      const idx = findLastIndex(items, i => i.type === 'assistant' && i.id === event.id)
      if (idx !== -1) {
        const item = items[idx] as AssistantItem
        const reasoning = event.reasoning ?? item.reasoning
        items[idx] = {
          ...item,
          isStreaming: false,
          reasoning,
          // Preserve the reasoning snapshot if we had one
          reasoningSnapshot: item.reasoningSnapshot,
        }
      }
      return { ...state, items, _currentAssistantTurnId: null, _currentBatchId: null }
    }

    case 'tool_call_created':
    case 'tool_call_updated':
    case 'tool_call_completed': {
      return reduceToolCallEvent(state, event)
    }

    case 'blocked_enter': {
      const items = [...state.items]
      const nextId = state._nextId + 1
      if (event.reason === 'waiting_user' && event.question) {
        items.push({
          type: 'question',
          id: `question-${nextId}`,
          question: event.question,
          detail: event.questionDetail ?? null,
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
      // blocked breaks the current batch
      return { ...state, items, isRunning: false, _nextId: nextId, _currentBatchId: null }
    }

    case 'blocked_exit':
      return { ...state, isRunning: true }

    case 'session_done': {
      const nextId = state._nextId + 1
      return {
        ...state,
        isRunning: false,
        _nextId: nextId,
        _currentAssistantTurnId: null,
        _currentBatchId: null,
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
// Tool call event reducer — handles batch grouping
// ---------------------------------------------------------------------------

function reduceToolCallEvent(
  state: TimelineState,
  event: Extract<LifecycleEvent, { type: 'tool_call_created' | 'tool_call_updated' | 'tool_call_completed' }>,
): TimelineState {
  const tc = event.toolCall
  const items = [...state.items]

  // Check if this tool call already exists in a batch
  const existingBatchIdx = findLastIndex(items, i =>
    i.type === 'tool_batch' && (i as ToolBatchItem).toolCalls.some(t => t.id === tc.id),
  )

  if (existingBatchIdx !== -1) {
    // Update existing tool call within its batch
    const batch = items[existingBatchIdx] as ToolBatchItem
    const updatedToolCalls = batch.toolCalls.map(t => t.id === tc.id ? tc : t)
    items[existingBatchIdx] = { ...batch, toolCalls: updatedToolCalls }
    return { ...state, items }
  }

  // Check if this tool call exists as a standalone item (legacy / single)
  const existingStandaloneIdx = findLastIndex(items, i => i.type === 'tool_call' && i.id === tc.id)
  if (existingStandaloneIdx !== -1) {
    items[existingStandaloneIdx] = { type: 'tool_call', id: tc.id, toolCall: tc }
    return { ...state, items }
  }

  // New tool call — decide whether to batch or standalone
  if (event.type === 'tool_call_created' && state._currentAssistantTurnId) {
    // Try to append to current open batch
    if (state._currentBatchId) {
      const batchIdx = findLastIndex(items, i => i.type === 'tool_batch' && i.id === state._currentBatchId)
      if (batchIdx !== -1) {
        const batch = items[batchIdx] as ToolBatchItem
        // Get reasoning from the current assistant turn
        const assistantItem = findAssistantItem(items, state._currentAssistantTurnId)
        items[batchIdx] = {
          ...batch,
          toolCalls: [...batch.toolCalls, tc],
          reasoning: assistantItem?.reasoning ?? batch.reasoning,
        }
        return { ...state, items }
      }
    }

    // Check if the last item is a standalone tool_call from the same assistant turn
    // that we can upgrade to a batch
    const lastItem = items[items.length - 1]
    if (lastItem?.type === 'tool_call') {
      const assistantItem = findAssistantItem(items, state._currentAssistantTurnId)
      const batchId = `batch-${state._nextId + 1}`
      // Replace the standalone with a batch containing both
      items[items.length - 1] = {
        type: 'tool_batch',
        id: batchId,
        assistantTurnId: state._currentAssistantTurnId,
        toolCalls: [(lastItem as ToolCallItem).toolCall, tc],
        reasoning: assistantItem?.reasoning ?? null,
      }
      return { ...state, items, _currentBatchId: batchId, _nextId: state._nextId + 1 }
    }

    // Start a new standalone tool call (may become a batch if more follow)
    items.push({ type: 'tool_call', id: tc.id, toolCall: tc })
    return { ...state, items }
  }

  // Fallback: standalone tool call
  items.push({ type: 'tool_call', id: tc.id, toolCall: tc })
  return { ...state, items }
}

function findAssistantItem(items: TimelineItem[], turnId: string): AssistantItem | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!
    if (item.type === 'assistant' && item.id === turnId) return item as AssistantItem
  }
  return null
}

// ---------------------------------------------------------------------------
// Raw stream integration — update assistant thinking/text from raw events
// ---------------------------------------------------------------------------

export function applyThinkingDelta(state: TimelineState, delta: string): TimelineState {
  const items = [...state.items]
  const idx = findLastIndex(items, i => i.type === 'assistant' && (i as AssistantItem).isStreaming)
  if (idx !== -1) {
    const item = items[idx] as AssistantItem
    const newThinking = item.thinking + delta
    // Capture a stable reasoning snapshot from the first meaningful chunk
    const reasoningSnapshot = item.reasoningSnapshot ?? extractReasoningSnapshot(newThinking)
    items[idx] = { ...item, thinking: newThinking, reasoningSnapshot }
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

/**
 * Extract a stable reasoning snapshot from accumulated thinking text.
 * Returns the first complete sentence (up to 120 chars), or null if not enough text yet.
 */
function extractReasoningSnapshot(thinking: string): string | null {
  if (thinking.length < 10) return null
  // Try to get first sentence
  const match = thinking.match(/^(.+?[.!?])(?:\s|$)/)
  if (match?.[1] && match[1].length <= 120) return match[1].trim()
  // If we have enough text but no sentence boundary, take a chunk
  if (thinking.length >= 40) {
    const truncated = thinking.slice(0, 100).trim()
    return truncated + (thinking.length > 100 ? '…' : '')
  }
  return null
}

// ---------------------------------------------------------------------------
// Timeline snapshot — serializable subset for persistence
// ---------------------------------------------------------------------------

/**
 * A serializable snapshot of the timeline state.
 * Used for session persistence — on resume, this is hydrated back into
 * a full TimelineState so the UI shows continuity.
 */
export interface TimelineSnapshot {
  items: TimelineItem[]
  startTime: number
  _nextId: number
}

/** Extract a serializable snapshot from timeline state */
export function captureTimelineSnapshot(state: TimelineState): TimelineSnapshot {
  return {
    items: state.items.map(item => {
      // Strip streaming flags — everything is "done" in a snapshot
      if (item.type === 'assistant') {
        return { ...item, isStreaming: false }
      }
      return { ...item }
    }),
    startTime: state.startTime,
    _nextId: state._nextId,
  }
}

/** Hydrate a TimelineState from a persisted snapshot */
export function hydrateTimelineState(snapshot: TimelineSnapshot): TimelineState {
  return {
    items: snapshot.items,
    isRunning: false,
    isIdle: true,
    startTime: snapshot.startTime,
    _nextId: snapshot._nextId,
    _currentAssistantTurnId: null,
    _currentBatchId: null,
  }
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
