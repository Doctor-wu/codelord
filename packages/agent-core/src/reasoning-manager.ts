// ---------------------------------------------------------------------------
// ReasoningManager — reasoning state lifecycle per assistant turn
// ---------------------------------------------------------------------------

import type { AssistantReasoningState, ReasoningStatus } from './events.js'
import { createReasoningState } from './events.js'

export type ReasoningLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

export class ReasoningManager {
  private _level: ReasoningLevel
  private _current: AssistantReasoningState | null = null

  constructor(level: ReasoningLevel = 'high') {
    this._level = level
  }

  get level(): ReasoningLevel { return this._level }
  get current(): AssistantReasoningState | null { return this._current }

  setLevel(level: ReasoningLevel): void { this._level = level }

  /**
   * Begin a new assistant turn.
   * Returns null when level is 'off' — no reasoning state is created (D13 fix).
   */
  beginTurn(): AssistantReasoningState | null {
    if (this._level === 'off') {
      this._current = null
      return null
    }
    this._current = createReasoningState()
    return this._current
  }

  /** Get the reasoning option to pass to streamSimple. */
  getStreamOption(modelSupportsReasoning: boolean): { reasoning: string } | Record<string, never> {
    if (modelSupportsReasoning && this._level !== 'off') {
      return { reasoning: this._level }
    }
    return {}
  }

  appendThought(delta: string): void {
    if (this._current) {
      this._current.rawThoughtText += delta
    }
  }

  setStatus(status: ReasoningStatus): void {
    if (this._current) {
      this._current.status = status
    }
  }

  endTurn(): void {
    if (this._current) {
      this._current.status = 'completed'
    }
  }

  /** Snapshot of current state (for lifecycle emission). */
  snapshot(): AssistantReasoningState {
    return { ...(this._current ?? createReasoningState()) }
  }
}
