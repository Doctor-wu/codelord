// ---------------------------------------------------------------------------
// SessionSnapshot — serializable session state for persistence + resume
// ---------------------------------------------------------------------------

import type { Message } from '@mariozechner/pi-ai'
import type { RuntimeState, RunOutcome } from './runtime.js'
import type { PendingQuestion, ResolvedQuestion } from './tools/ask-user.js'
import type { ToolRouteDecision } from './tool-router.js'
import type { ToolSafetyDecision } from './tool-safety.js'
import type { CheckpointRecord } from './checkpoint.js'
import type { UsageAggregate } from './events.js'
import type { ToolCallStats, RouteHitStats } from './tool-stats.js'

// ---------------------------------------------------------------------------
// Core snapshot — everything needed to resume a session
// ---------------------------------------------------------------------------

/**
 * Persisted state of a session at a safe boundary.
 *
 * Design rules:
 * - No API keys, tokens, or auth secrets
 * - Only JSON-serializable values
 * - Captures runtime state, not UI state (timeline is a separate concern)
 */
export interface SessionSnapshot {
  /** Schema version — bump when the shape changes */
  version: 1

  // --- Identity ---
  sessionId: string
  createdAt: number
  updatedAt: number

  // --- Environment ---
  cwd: string
  provider: string
  model: string

  // --- Runtime FSM ---
  /** State at time of snapshot. STREAMING/TOOL_EXEC are recorded but
   *  will be downgraded to a safe state on resume. */
  runtimeState: RuntimeState
  /** If runtimeState was in-flight at snapshot time, this records the original */
  wasInFlight: boolean

  // --- Conversation ---
  messages: Message[]

  // --- Queue ---
  pendingInbound: Message[]

  // --- Question ---
  pendingQuestion: PendingQuestion | null

  // --- Side channels ---
  resolvedQuestions: ResolvedQuestion[]
  lastOutcome: RunOutcome | null
  routeRecords: ToolRouteDecision[]
  safetyRecords: ToolSafetyDecision[]

  // --- Counters ---
  sessionStepCount: number

  // --- Checkpoint stack ---
  checkpoints: CheckpointRecord[]

  // --- Usage telemetry ---
  usageAggregate: UsageAggregate

  // --- Tool stats ---
  toolStats?: { tools: Record<string, ToolCallStats>; routes: Record<string, RouteHitStats> }
}

// ---------------------------------------------------------------------------
// Session metadata — lightweight index entry (no messages)
// ---------------------------------------------------------------------------

export interface SessionMeta {
  sessionId: string
  createdAt: number
  updatedAt: number
  cwd: string
  provider: string
  model: string
  runtimeState: RuntimeState
  wasInFlight: boolean
  messageCount: number
  pendingInboundCount: number
  hasPendingQuestion: boolean
}

/** Extract lightweight metadata from a full snapshot */
export function toSessionMeta(snapshot: SessionSnapshot): SessionMeta {
  return {
    sessionId: snapshot.sessionId,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    cwd: snapshot.cwd,
    provider: snapshot.provider,
    model: snapshot.model,
    runtimeState: snapshot.runtimeState,
    wasInFlight: snapshot.wasInFlight,
    messageCount: snapshot.messages.length,
    pendingInboundCount: snapshot.pendingInbound.length,
    hasPendingQuestion: snapshot.pendingQuestion !== null,
  }
}

// ---------------------------------------------------------------------------
// Safe-state resolution — what happens when we resume from in-flight
// ---------------------------------------------------------------------------

/** States that can be directly resumed */
const SAFE_STATES: ReadonlySet<RuntimeState> = new Set(['IDLE', 'READY', 'BLOCKED'])

/** Determine the safe state to resume into */
export function resolveResumeState(snapshot: SessionSnapshot): {
  state: RuntimeState
  wasDowngraded: boolean
  interruptedDuring: RuntimeState | null
} {
  if (SAFE_STATES.has(snapshot.runtimeState)) {
    return { state: snapshot.runtimeState, wasDowngraded: false, interruptedDuring: null }
  }
  // In-flight states get downgraded to READY — we have committed messages
  // but the in-flight operation was not completed
  return {
    state: 'READY',
    wasDowngraded: true,
    interruptedDuring: snapshot.runtimeState,
  }
}
