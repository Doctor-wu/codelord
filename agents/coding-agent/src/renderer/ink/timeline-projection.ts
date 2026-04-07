// ---------------------------------------------------------------------------
// Timeline Projection — reduces LifecycleEvents into a stable view model
// ---------------------------------------------------------------------------

import type { LifecycleEvent, ToolCallLifecycle, AssistantReasoningState, QuestionDetail, UsageAggregate, SessionSnapshot, PendingQuestion } from '@agent/core'
import { createToolCallLifecycle } from '@agent/core'

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
  /** Honest live proxy text derived from raw stream events (not fabricated thought) */
  liveProxy: string | null
  /** Whether provider has sent any thinking_* events this turn */
  hasProviderThought: boolean
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
  status: 'running' | 'idle' | 'done' | 'error' | 'info'
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

/** Resume context — set by reconciliation, consumed by renderer for status display */
export interface ResumeContext {
  /** Session was resumed (not a fresh start) */
  isResumed: boolean
  /** The previous run was interrupted mid-flight and downgraded */
  wasDowngraded: boolean
  /** What phase was interrupted (e.g. 'STREAMING') */
  interruptedDuring: string | null
  /** Runtime has a pending question awaiting user answer */
  hasPendingQuestion: boolean
  /** Number of pending inbound queue messages at resume time */
  pendingInboundCount: number
}

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
  /** Cumulative usage telemetry (updated via usage_updated lifecycle event) */
  usage: UsageAggregate | null
  /** Cumulative step count (increments on each assistant_turn_start) */
  stepCount: number
  /** Map of provisional tool call ids (contentIndex → provisionalId) for handoff */
  _provisionalToolCalls: Map<number, string>
  /** Resume context — populated by reconciliation, null for fresh sessions */
  resumeContext: ResumeContext | null
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
    usage: null,
    stepCount: 0,
    _provisionalToolCalls: new Map(),
    resumeContext: null,
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
        _provisionalToolCalls: new Map(),
        stepCount: state.stepCount + 1,
        items: [...state.items, {
          type: 'assistant',
          id: event.id,
          thinking: '',
          text: '',
          isStreaming: true,
          reasoning: event.reasoning ?? null,
          reasoningSnapshot: null,
          liveProxy: 'Thinking…',
          hasProviderThought: false,
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
          reasoningSnapshot: item.reasoningSnapshot,
          liveProxy: null,
        }
      }
      return { ...state, items, _currentAssistantTurnId: null, _currentBatchId: null, _provisionalToolCalls: new Map() }
    }

    case 'tool_call_created':
    case 'tool_call_updated':
    case 'tool_call_completed': {
      return reduceToolCallEvent(state, event)
    }

    case 'usage_updated':
      return { ...state, usage: event.usage }

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
      }
      // interrupted no longer produces a status item — runtime goes straight to READY
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

    case 'command_feedback': {
      const nextId = state._nextId + 1
      return {
        ...state,
        _nextId: nextId,
        items: [...state.items, {
          type: 'status' as const,
          id: `status-${nextId}`,
          status: event.success ? 'info' as const : 'error' as const,
          message: event.message,
          timestamp: event.timestamp,
        }],
      }
    }

    // Events consumed by trace recorder, not by timeline projection
    case 'queue_drained':
    case 'question_answered':
    case 'interrupt_requested':
    case 'interrupt_observed':
      return state
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

  // --- Provisional → stable handoff ---
  // If tool_call_created and a provisional with the same id exists, replace in-place
  if (event.type === 'tool_call_created') {
    const handoff = handoffProvisionalToStable(items, tc)
    if (handoff) {
      // Update live proxy to "acting"
      updateAssistantLiveProxy(items, state._currentAssistantTurnId, `准备执行 ${tc.toolName}…`)
      return { ...state, items }
    }
    // Also check by provisionalId match
    const provHandoff = handoffProvisionalByProvId(items, tc)
    if (provHandoff) {
      updateAssistantLiveProxy(items, state._currentAssistantTurnId, `准备执行 ${tc.toolName}…`)
      return { ...state, items }
    }
  }

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

/** Handoff: replace a provisional tool call with the stable lifecycle version (by id match) */
function handoffProvisionalToStable(items: TimelineItem[], stableTc: ToolCallLifecycle): boolean {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!
    if (item.type === 'tool_call' && item.id === stableTc.id) {
      const existing = (item as ToolCallItem).toolCall
      if (existing.provisionalId) {
        items[i] = { type: 'tool_call', id: stableTc.id, toolCall: stableTc }
        return true
      }
    }
    if (item.type === 'tool_batch') {
      const batch = item as ToolBatchItem
      const tcIdx = batch.toolCalls.findIndex(tc => tc.id === stableTc.id && tc.provisionalId)
      if (tcIdx !== -1) {
        const updatedTcs = [...batch.toolCalls]
        updatedTcs[tcIdx] = stableTc
        items[i] = { ...batch, toolCalls: updatedTcs }
        return true
      }
    }
  }
  return false
}

/** Handoff: find provisional by provisionalId field matching stableTc.provisionalId */
function handoffProvisionalByProvId(items: TimelineItem[], stableTc: ToolCallLifecycle): boolean {
  if (!stableTc.provisionalId) return false
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!
    if (item.type === 'tool_call') {
      const existing = (item as ToolCallItem).toolCall
      if (existing.provisionalId && existing.id === existing.provisionalId) {
        // This is still using its provisional id — replace
        items[i] = { type: 'tool_call', id: stableTc.id, toolCall: stableTc }
        return true
      }
    }
    if (item.type === 'tool_batch') {
      const batch = item as ToolBatchItem
      const tcIdx = batch.toolCalls.findIndex(tc => tc.provisionalId && tc.id === tc.provisionalId)
      if (tcIdx !== -1) {
        const updatedTcs = [...batch.toolCalls]
        updatedTcs[tcIdx] = stableTc
        items[i] = { ...batch, toolCalls: updatedTcs }
        return true
      }
    }
  }
  return false
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
    const reasoningSnapshot = item.reasoningSnapshot ?? extractReasoningSnapshot(newThinking)
    items[idx] = { ...item, thinking: newThinking, reasoningSnapshot, hasProviderThought: true, liveProxy: null }
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
// Provisional tool call integration — raw stream → early UI visibility
// ---------------------------------------------------------------------------

/**
 * Handle toolcall_start: create a provisional ToolCallLifecycle and add it to timeline.
 * This makes the tool visible BEFORE the lifecycle tool_call_created event.
 */
export function applyToolCallStart(
  state: TimelineState,
  contentIndex: number,
  toolName: string,
  args: Record<string, unknown>,
): TimelineState {
  const provisionalId = `prov-raw-${contentIndex}-${state._nextId + 1}`
  const tc = createToolCallLifecycle({
    provisionalId,
    toolName,
    args,
    command: formatProvisionalCommand(toolName, args),
  })
  // Mark as provisional
  tc.phase = 'generating'

  const provMap = new Map(state._provisionalToolCalls)
  provMap.set(contentIndex, provisionalId)

  // Update live proxy on the current assistant item
  const items = [...state.items]
  updateAssistantLiveProxy(items, state._currentAssistantTurnId, `正在构建 ${toolName} 调用…`)

  // Add provisional tool call to timeline (uses same batch logic)
  const newState: TimelineState = {
    ...state,
    items,
    _nextId: state._nextId + 1,
    _provisionalToolCalls: provMap,
  }
  return addProvisionalToolCall(newState, tc)
}

/**
 * Handle toolcall_delta: update the provisional tool call's args.
 */
export function applyToolCallDelta(
  state: TimelineState,
  contentIndex: number,
  toolName: string,
  args: Record<string, unknown>,
): TimelineState {
  const provisionalId = state._provisionalToolCalls.get(contentIndex)
  if (!provisionalId) return state

  const items = [...state.items]

  // Update live proxy
  const argsPreview = formatArgsPreview(args)
  const proxyText = argsPreview
    ? `正在构建 ${toolName}(${argsPreview})…`
    : `正在构建 ${toolName} 调用…`
  updateAssistantLiveProxy(items, state._currentAssistantTurnId, proxyText)

  // Find and update the provisional tool call
  updateProvisionalToolCall(items, provisionalId, (tc) => ({
    ...tc,
    args,
    command: formatProvisionalCommand(toolName, args),
  }))

  return { ...state, items }
}

/**
 * Handle toolcall_end: finalize the provisional tool call.
 * The provisional stays until lifecycle tool_call_created replaces it.
 */
export function applyToolCallEnd(
  state: TimelineState,
  contentIndex: number,
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>,
): TimelineState {
  const provisionalId = state._provisionalToolCalls.get(contentIndex)
  if (!provisionalId) return state

  const items = [...state.items]

  // Update live proxy to "finalizing"
  updateAssistantLiveProxy(items, state._currentAssistantTurnId, `准备执行 ${toolName}…`)

  // Finalize the provisional: update id to the real toolCallId for handoff
  updateProvisionalToolCall(items, provisionalId, (tc) => ({
    ...tc,
    id: toolCallId,
    provisionalId,
    toolName,
    args,
    command: formatProvisionalCommand(toolName, args),
  }))

  // Update the provisional map: now keyed by the real id for handoff
  const provMap = new Map(state._provisionalToolCalls)
  provMap.delete(contentIndex)

  return { ...state, items, _provisionalToolCalls: provMap }
}

/** Format a short args preview for live proxy display */
function formatArgsPreview(args: Record<string, unknown>): string | null {
  // Show the first meaningful arg value, truncated
  const keys = Object.keys(args)
  if (keys.length === 0) return null
  const firstKey = keys[0]!
  const val = args[firstKey]
  if (typeof val === 'string') {
    return val.length > 40 ? val.slice(0, 37) + '…' : val
  }
  return null
}

/** Format a provisional command string from args */
function formatProvisionalCommand(toolName: string, args: Record<string, unknown>): string {
  // Use the first string arg as command preview
  for (const val of Object.values(args)) {
    if (typeof val === 'string') {
      return val.length > 60 ? val.slice(0, 57) + '…' : val
    }
  }
  return toolName
}

/** Update the liveProxy field on the current streaming assistant item */
function updateAssistantLiveProxy(items: TimelineItem[], turnId: string | null, proxy: string): void {
  if (!turnId) return
  const idx = findLastIndex(items, i => i.type === 'assistant' && i.id === turnId)
  if (idx !== -1) {
    const item = items[idx] as AssistantItem
    // Only set live proxy if provider hasn't sent real thoughts
    if (!item.hasProviderThought) {
      items[idx] = { ...item, liveProxy: proxy }
    }
  }
}

/** Update a provisional tool call in-place within items (standalone or batch) */
function updateProvisionalToolCall(
  items: TimelineItem[],
  provisionalId: string,
  updater: (tc: ToolCallLifecycle) => ToolCallLifecycle,
): void {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!
    if (item.type === 'tool_call' && (item as ToolCallItem).toolCall.id === provisionalId) {
      const updated = updater((item as ToolCallItem).toolCall)
      items[i] = { ...item, id: updated.id, toolCall: updated } as ToolCallItem
      return
    }
    if (item.type === 'tool_batch') {
      const batch = item as ToolBatchItem
      const tcIdx = batch.toolCalls.findIndex(tc => tc.id === provisionalId)
      if (tcIdx !== -1) {
        const updatedTcs = [...batch.toolCalls]
        updatedTcs[tcIdx] = updater(updatedTcs[tcIdx]!)
        items[i] = { ...batch, toolCalls: updatedTcs }
        return
      }
    }
  }
}

/** Add a provisional tool call to the timeline, respecting batch grouping */
function addProvisionalToolCall(state: TimelineState, tc: ToolCallLifecycle): TimelineState {
  const items = [...state.items]

  if (state._currentAssistantTurnId) {
    // Try to append to current open batch
    if (state._currentBatchId) {
      const batchIdx = findLastIndex(items, i => i.type === 'tool_batch' && i.id === state._currentBatchId)
      if (batchIdx !== -1) {
        const batch = items[batchIdx] as ToolBatchItem
        const assistantItem = findAssistantItem(items, state._currentAssistantTurnId)
        items[batchIdx] = {
          ...batch,
          toolCalls: [...batch.toolCalls, tc],
          reasoning: assistantItem?.reasoning ?? batch.reasoning,
        }
        return { ...state, items }
      }
    }

    // Check if the last item is a standalone tool_call we can upgrade to batch
    const lastItem = items[items.length - 1]
    if (lastItem?.type === 'tool_call') {
      const assistantItem = findAssistantItem(items, state._currentAssistantTurnId)
      const batchId = `batch-${state._nextId + 1}`
      items[items.length - 1] = {
        type: 'tool_batch',
        id: batchId,
        assistantTurnId: state._currentAssistantTurnId,
        toolCalls: [(lastItem as ToolCallItem).toolCall, tc],
        reasoning: assistantItem?.reasoning ?? null,
      }
      return { ...state, items, _currentBatchId: batchId, _nextId: state._nextId + 1 }
    }

    // Start a new standalone tool call
    items.push({ type: 'tool_call', id: tc.id, toolCall: tc })
    return { ...state, items }
  }

  // Fallback: standalone
  items.push({ type: 'tool_call', id: tc.id, toolCall: tc })
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
  usage: UsageAggregate | null
  stepCount: number
}

/** Extract a serializable snapshot from timeline state */
export function captureTimelineSnapshot(state: TimelineState): TimelineSnapshot {
  return {
    items: state.items.map(item => {
      if (item.type === 'assistant') {
        return { ...item, isStreaming: false, liveProxy: null }
      }
      return { ...item }
    }),
    startTime: state.startTime,
    _nextId: state._nextId,
    usage: state.usage,
    stepCount: state.stepCount,
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
    usage: snapshot.usage ?? null,
    stepCount: snapshot.stepCount ?? 0,
    _provisionalToolCalls: new Map(),
    resumeContext: null,
  }
}

// ---------------------------------------------------------------------------
// Resume reconciliation — align timeline with runtime snapshot truth
// ---------------------------------------------------------------------------

export interface ReconcileContext {
  snapshot: SessionSnapshot
  wasDowngraded: boolean
  interruptedDuring: string | null
}

/**
 * Reconcile a timeline state with the runtime snapshot truth.
 * The timeline snapshot is a UI cache; the SessionSnapshot is the source of truth.
 *
 * This function:
 * - Starts from the timeline snapshot if available, otherwise creates a minimal one
 * - Removes stale control items (question/interrupted) that don't match runtime state
 * - Injects missing control items (question/interrupted) that runtime state requires
 * - Preserves usage/stepCount telemetry from the timeline or snapshot
 */
export function reconcileTimelineForResume(
  timelineSnapshot: TimelineSnapshot | null,
  ctx: ReconcileContext,
): TimelineState {
  const { snapshot, wasDowngraded, interruptedDuring } = ctx
  const now = Date.now()

  // Start from timeline cache or empty
  let state: TimelineState
  if (timelineSnapshot) {
    state = hydrateTimelineState(timelineSnapshot)
  } else {
    state = createInitialTimelineState(true)
    // Use snapshot's createdAt as startTime for a more meaningful elapsed
    state.startTime = snapshot.createdAt
  }

  // Preserve usage from snapshot if timeline doesn't have it
  if (!state.usage && snapshot.usageAggregate && snapshot.usageAggregate.totalTokens > 0) {
    state.usage = snapshot.usageAggregate
  }

  // Preserve stepCount from snapshot if timeline doesn't have it
  if (state.stepCount === 0 && snapshot.sessionStepCount > 0) {
    state.stepCount = snapshot.sessionStepCount
  }

  // --- Remove stale control items ---
  const items = state.items.filter(item => {
    // Remove question items if runtime has no pending question
    if (item.type === 'question' && !snapshot.pendingQuestion) return false
    return true
  })

  // --- Check what control items are already present ---
  const lastItem = items[items.length - 1]
  const hasQuestion = lastItem?.type === 'question'

  let nextId = state._nextId

  // --- Inject missing control items from runtime truth ---
  if (snapshot.pendingQuestion && !hasQuestion) {
    nextId++
    items.push(buildQuestionItem(snapshot.pendingQuestion, nextId, now))
  }

  return {
    ...state,
    items,
    _nextId: nextId,
    isRunning: false,
    isIdle: true,
    resumeContext: {
      isResumed: true,
      wasDowngraded,
      interruptedDuring,
      hasPendingQuestion: !!snapshot.pendingQuestion,
      pendingInboundCount: snapshot.pendingInbound?.length ?? 0,
    },
  }
}

function buildQuestionItem(pq: PendingQuestion, nextId: number, timestamp: number): QuestionItem {
  return {
    type: 'question',
    id: `question-${nextId}`,
    question: pq.question,
    detail: {
      question: pq.question,
      whyAsk: pq.whyAsk,
      options: pq.options,
      expectedAnswerFormat: pq.expectedAnswerFormat,
      defaultPlanIfNoAnswer: pq.defaultPlanIfNoAnswer,
    },
    reasoning: null,
    timestamp,
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
