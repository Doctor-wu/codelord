import type { LifecycleEvent, AgentLifecycleCallbacks } from '@codelord/core'
import type { TimelineSnapshot } from './ink/timeline-projection.js'

// ---------------------------------------------------------------------------
// Renderer interface — pure output, no interaction logic
// ---------------------------------------------------------------------------

export interface Renderer {
  onLifecycleEvent?(event: LifecycleEvent): void
  cleanup(): void
}

// ---------------------------------------------------------------------------
// RuntimeQueueInfo — read-only view of runtime queue for UI display
// ---------------------------------------------------------------------------

export interface RuntimeQueueInfo {
  readonly pendingInboundCount: number
  readonly pendingInboundPreviews: string[]
}

// ---------------------------------------------------------------------------
// InteractiveRenderer — extends Renderer with input capabilities for REPL
// ---------------------------------------------------------------------------

export interface InteractiveRenderer extends Renderer {
  waitForInput(): Promise<string | null>
  /** Signal running state; optionally pass runtime for queue info */
  setRunning(running: boolean, runtimeQueue?: RuntimeQueueInfo): void
  /** Set the callback for queue submissions during running */
  setQueueTarget(enqueue: (text: string) => void): void
  /** Set the callback for Escape-key interrupt */
  setInterruptHandler(handler: () => void): void
  /** Set the callback for Ctrl+C exit */
  setExitHandler(handler: () => void): void
  /** Update reasoning level display in footer */
  setReasoningLevel(level: string): void
  /** Capture current timeline state for persistence */
  captureTimelineSnapshot(): TimelineSnapshot
  /** Restore timeline state from a persisted snapshot */
  hydrateTimeline(snapshot: TimelineSnapshot): void
  /** Build lifecycle callbacks for pipeable subscription */
  buildLifecycleCallbacks(): AgentLifecycleCallbacks
}
