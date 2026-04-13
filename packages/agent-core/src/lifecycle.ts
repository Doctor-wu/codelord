import type { Pipeable } from './pipeable.js'
import type { ToolCallLifecycle, ToolCallPhase, ToolCallRouteInfo, ToolCallSafetyInfo } from './events.js'

// ---------------------------------------------------------------------------
// Lifecycle callback event types
// ---------------------------------------------------------------------------

export interface StartEvent {
  turnId: string
  timestamp: number
}

export interface TextEvent {
  turnId: string
  contentIndex: number
  pipeable: Pipeable<string, string>
  timestamp: number
}

export interface ThinkingEvent {
  turnId: string
  contentIndex: number
  pipeable: Pipeable<string, string>
  timestamp: number
}

/**
 * Delta events pushed through a tool call's Pipeable.
 * Subscribers receive a stream of these as the tool call progresses.
 */
export type ToolCallDelta =
  | { type: 'streaming_args'; toolName: string; args: Record<string, unknown> }
  | { type: 'id_resolved'; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: 'phase_change'; phase: ToolCallPhase }
  | { type: 'stdout'; chunk: string }
  | { type: 'stderr'; chunk: string }
  | { type: 'route'; route: ToolCallRouteInfo }
  | { type: 'safety'; safety: ToolCallSafetyInfo }

export interface ToolCallEvent {
  turnId: string
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  pipeable: Pipeable<ToolCallDelta, ToolCallLifecycle>
  timestamp: number
}

export interface ErrorEvent {
  error: string
  timestamp: number
}

export interface AbortEvent {
  reason: 'interrupted'
  timestamp: number
}

export interface DoneEvent {
  text: string
  timestamp: number
}

// ---------------------------------------------------------------------------
// Lifecycle callbacks interface
// ---------------------------------------------------------------------------

/**
 * Agent lifecycle callbacks — the Layer 1 consumer interface.
 *
 * All callbacks are optional. Consumers pick what they need:
 * - Streaming UI: onText/onThinking (subscribe pipeable for deltas), onToolCall
 * - Headless: onDone (await pipeable.done() for final values)
 * - Trace: onDone, onToolCall (record trajectory from completed states)
 */
export interface AgentLifecycleCallbacks {
  /** Fired when an assistant turn begins. */
  onStart?: (event: StartEvent) => void
  /** Fired for each text content block. Subscribe pipeable for streaming deltas. */
  onText?: (event: TextEvent) => void
  /** Fired for each thinking content block. Subscribe pipeable for streaming deltas. */
  onThinking?: (event: ThinkingEvent) => void
  /** Fired for each tool call. Subscribe pipeable for execution progress. */
  onToolCall?: (event: ToolCallEvent) => void
  /** Fired on unrecoverable error. */
  onError?: (event: ErrorEvent) => void
  /** Fired when execution is aborted (e.g. user interrupt). */
  onAbort?: (event: AbortEvent) => void
  /** Fired on successful completion only. */
  onDone?: (event: DoneEvent) => void
}

// ---------------------------------------------------------------------------
// Merge utility
// ---------------------------------------------------------------------------

/**
 * Merge multiple AgentLifecycleCallbacks into one.
 * Each callback is invoked on all provided objects that define it.
 * Pipeable subscribe is naturally multi-subscriber, so each consumer
 * gets its own subscription to the same pipeable.
 */
export function mergeLifecycleCallbacks(...sources: AgentLifecycleCallbacks[]): AgentLifecycleCallbacks {
  const merged: AgentLifecycleCallbacks = {}
  const keys: (keyof AgentLifecycleCallbacks)[] = [
    'onStart', 'onText', 'onThinking', 'onToolCall', 'onError', 'onAbort', 'onDone',
  ]
  for (const key of keys) {
    const handlers = sources.map(s => s[key]).filter(Boolean) as ((event: any) => void)[]
    if (handlers.length > 0) {
      ;(merged as any)[key] = (event: any) => {
        for (const h of handlers) h(event)
      }
    }
  }
  return merged
}
