import type { AgentEvent } from '@agent/core'

// ---------------------------------------------------------------------------
// Renderer interface — pure output, no interaction logic
// ---------------------------------------------------------------------------

export interface Renderer {
  /** Handle a single agent event and render output. */
  onEvent(event: AgentEvent): void
  /** Post-run cleanup (e.g. final status bar update). No user interaction. */
  cleanup(): void
}
