// ---------------------------------------------------------------------------
// TimelineStore — event → state bridge (pure logic, no React)
// ---------------------------------------------------------------------------

import type { AgentEvent, LifecycleEvent } from '@agent/core'
import type { TimelineState } from './timeline-projection.js'
import {
  createInitialTimelineState,
  reduceLifecycleEvent,
  applyThinkingDelta,
  applyTextDelta,
  applyToolCallStart,
  applyToolCallDelta,
  applyToolCallEnd,
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

  constructor(idle = false) {
    this.state = createInitialTimelineState(idle)
  }

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
      case 'toolcall_start':
        this.flushPendingDelta()
        this.state = applyToolCallStart(this.state, event.contentIndex, event.toolName, event.args)
        this.notify()
        break
      case 'toolcall_delta':
        this.notifyThrottled(
          applyToolCallDelta(this._pendingDeltaState ?? this.state, event.contentIndex, event.toolName, event.args),
        )
        break
      case 'toolcall_end':
        this.flushPendingDelta()
        this.state = applyToolCallEnd(this.state, event.contentIndex, event.toolCall.id, event.toolCall.name, event.toolCall.arguments)
        this.notify()
        break
    }
  }

  onLifecycleEvent(event: LifecycleEvent): void {
    this.state = this._pendingDeltaState ?? this.state
    this._pendingDeltaState = null
    if (this._deltaFlushTimer) {
      clearTimeout(this._deltaFlushTimer)
      this._deltaFlushTimer = null
    }
    this.state = reduceLifecycleEvent(this.state, event)
    this.notify()
  }

  captureSnapshot(): TimelineSnapshot { return captureTimelineSnapshot(this.state) }

  hydrateFromSnapshot(snapshot: TimelineSnapshot): void {
    this.state = hydrateTimelineState(snapshot)
    this.notify()
  }
}