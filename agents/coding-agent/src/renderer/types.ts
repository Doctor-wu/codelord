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
  waitForInput(): Promise<string | null>
  setRunning(running: boolean): void
  /** Drain messages queued during running. Returns them in submission order. */
  drainQueue(): string[]
}
