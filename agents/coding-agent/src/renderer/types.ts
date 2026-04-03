import type { AgentEvent, LifecycleEvent } from '@agent/core'

// ---------------------------------------------------------------------------
// Renderer interface — pure output, no interaction logic
// ---------------------------------------------------------------------------

export interface Renderer {
  /** Handle a single raw agent event (streaming deltas). */
  onEvent(event: AgentEvent): void
  /** Handle a lifecycle event (stable semantic events). */
  onLifecycleEvent?(event: LifecycleEvent): void
  /** Post-run cleanup (e.g. final status bar update). No user interaction. */
  cleanup(): void
}

// ---------------------------------------------------------------------------
// InteractiveRenderer — extends Renderer with input capabilities for REPL
// ---------------------------------------------------------------------------

export interface InteractiveRenderer extends Renderer {
  /**
   * Wait for the next user input line submitted through the Ink shell.
   * Resolves with the raw text (not trimmed). Returns null if input is closed.
   */
  waitForInput(): Promise<string | null>
  /** Signal that the agent is now running (hides input composer) */
  setRunning(running: boolean): void
}
