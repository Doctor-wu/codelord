// ---------------------------------------------------------------------------
// TimelineStore — event → state bridge (pure logic, no React)
// ---------------------------------------------------------------------------

import type { AgentEvent, LifecycleEvent, ReasoningLevel } from '@agent/core'
import { resolveReasoningVisibility } from '@agent/core'
import type { TimelineState } from './timeline-projection.js'
import {
  createInitialTimelineState,
  reduceLifecycleEvent,
  applyThinkingDelta,
  applyTextDelta,
  captureTimelineSnapshot,
  hydrateTimelineState,
} from './timeline-projection.js'
import type { TimelineSnapshot } from './timeline-projection.js'

type StateListener = (state: TimelineState) => void

export class TimelineStore {
  private state: TimelineState
  private listeners: Set<StateListener> = new Set()
  private _deltaFlushTimer: ReturnType<typeof setTimeout> | null = null
  private _pendingDeltaState: TimelineState | null = null
  private static readonly DELTA_THROTTLE_MS = 67 // ~15Hz
  private readonly _reasoningLevel: ReasoningLevel

  constructor(idle = false, reasoningLevel: ReasoningLevel = 'high') {
    this.state = createInitialTimelineState(idle)
    this._reasoningLevel = reasoningLevel
  }

  get reasoningLevel(): ReasoningLevel { return this._reasoningLevel }

  getState(): TimelineState { return this.state }

  /** Override running flag (used by tests and direct state injection) */
  setRunning(running: boolean): void {
    this.state = { ...this.state, isRunning: running }
    this.notify()
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    this.state = { ...this.state }
    for (const listener of this.listeners) listener(this.state)
  }

  private flushPendingDelta(): void {
    if (this._deltaFlushTimer) {
      clearTimeout(this._deltaFlushTimer)
      this._deltaFlushTimer = null
    }
    if (this._pendingDeltaState) {
      this.state = this._pendingDeltaState
      this._pendingDeltaState = null
      this.notify()
    }
  }

  private notifyThrottled(newState: TimelineState): void {
    this._pendingDeltaState = newState
    if (!this._deltaFlushTimer) {
      this._deltaFlushTimer = setTimeout(() => {
        this._deltaFlushTimer = null
        if (this._pendingDeltaState) {
          this.state = this._pendingDeltaState
          this._pendingDeltaState = null
          this.notify()
        }
      }, TimelineStore.DELTA_THROTTLE_MS)
    }
  }

  onRawEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'thinking_delta':
        this.state = applyThinkingDelta(this.state, event.delta)
        this.notify()
        break
      case 'text_delta':
        this.state = applyTextDelta(this.state, event.delta)
        this.notify()
        break
      // toolcall_start/delta/end now handled via lifecycle events (tool_call_streaming_*)
    }
  }

  onLifecycleEvent(event: LifecycleEvent): void {
    // tool_call_streaming_delta is high-frequency — throttle like raw deltas
    if (event.type === 'tool_call_streaming_delta') {
      this.notifyThrottled(reduceLifecycleEvent(this._pendingDeltaState ?? this.state, event))
      return
    }
    this.state = this._pendingDeltaState ?? this.state
    this._pendingDeltaState = null
    if (this._deltaFlushTimer) {
      clearTimeout(this._deltaFlushTimer)
      this._deltaFlushTimer = null
    }
    this.state = reduceLifecycleEvent(this.state, event)
    // Suppress liveProxy when visibility policy says no
    const vis = resolveReasoningVisibility(this._reasoningLevel)
    if (!vis.showThoughtViewport && !vis.showReasoningSummary) {
      this.state = suppressLiveProxy(this.state)
    }
    // Apply settled reasoning policy after assistant turn ends
    if (event.type === 'assistant_turn_end') {
      this.state = applySettledReasoningPolicy(this.state, this._reasoningLevel)
    }
    this.notify()
  }

  captureSnapshot(): TimelineSnapshot { return captureTimelineSnapshot(this.state) }

  hydrateFromSnapshot(snapshot: TimelineSnapshot): void {
    this.state = hydrateTimelineState(snapshot)
    this.notify()
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import type { AssistantItem } from './timeline-projection.js'

/** Clear liveProxy on the last streaming assistant item (used when visibility is suppressed) */
function suppressLiveProxy(state: TimelineState): TimelineState {
  const items = [...state.items]
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!
    if (item.type === 'assistant' && (item as AssistantItem).liveProxy) {
      items[i] = { ...(item as AssistantItem), liveProxy: null }
      return { ...state, items }
    }
  }
  return state
}

/**
 * Apply settled reasoning policy after assistant_turn_end.
 *
 * - high/xhigh + hasProviderThought: keep thinking (full viewport)
 * - high/xhigh + no thought: keep reasoningSnapshot, clear thinking (collapse)
 * - low/medium: keep reasoningSnapshot, clear thinking (collapse)
 * - minimal/off: clear thinking, reasoningSnapshot, liveProxy (hide)
 */
function applySettledReasoningPolicy(state: TimelineState, level: ReasoningLevel): TimelineState {
  const items = [...state.items]
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!
    if (item.type !== 'assistant') continue
    const a = item as AssistantItem
    if (a.isStreaming) continue // only apply to settled items

    switch (level) {
      case 'high':
      case 'xhigh':
        if (a.hasProviderThought) {
          // Keep thinking viewport as-is
        } else {
          // Collapse: keep snapshot, clear thinking
          items[i] = { ...a, thinking: '' }
        }
        break
      case 'low':
      case 'medium':
        // Collapse: keep snapshot, clear thinking
        items[i] = { ...a, thinking: '' }
        break
      case 'minimal':
      case 'off':
        // Hide: clear everything
        items[i] = { ...a, thinking: '', reasoningSnapshot: null, liveProxy: null }
        break
    }
    return { ...state, items }
  }
  return state
}