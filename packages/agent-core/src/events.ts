// ---------------------------------------------------------------------------
// Event Spine — dual-layer event model for agent runtime
// ---------------------------------------------------------------------------
//
// Layer 1: Lifecycle (stable, id-bearing semantic events)
// Layer 2: Provider Stream (raw trace, gated by rawMode)
//
// The runtime emits both layers. Renderers can consume either or both.
// Timeline projection consumes lifecycle events to build a stable view model.
// ---------------------------------------------------------------------------

import type { RiskLevel } from './tool-safety.js'

// ---------------------------------------------------------------------------
// AssistantReasoningState — structured cognitive state for an assistant turn
// ---------------------------------------------------------------------------

export type ReasoningStatus = 'thinking' | 'deciding' | 'acting' | 'blocked' | 'completed'

export interface AssistantReasoningState {
  /** Accumulated raw thinking text (streaming) */
  rawThoughtText: string
  /** What the assistant currently intends to do (may be null if not yet clear) */
  intent: string | null
  /** Why this step/action was chosen (may be null) */
  why: string | null
  /** What the assistant expects to observe from the next action (may be null) */
  expectedObservation: string | null
  /** What the assistant is uncertain about (may be null) */
  uncertainty: string | null
  /** What could go wrong if the current judgment is incorrect (may be null) */
  risk: string | null
  /** Current reasoning phase */
  status: ReasoningStatus
}

export function createReasoningState(): AssistantReasoningState {
  return {
    rawThoughtText: '',
    intent: null,
    why: null,
    expectedObservation: null,
    uncertainty: null,
    risk: null,
    status: 'thinking',
  }
}

/**
 * Extract a short display reason from reasoning state.
 * Priority: why → intent → first sentence of rawThoughtText → null
 */
export function projectDisplayReason(reasoning: AssistantReasoningState): string | null {
  if (reasoning.why) return reasoning.why
  if (reasoning.intent) return reasoning.intent
  if (reasoning.rawThoughtText) {
    // Extract first sentence, but don't break on periods that look like file extensions
    const firstSentence = reasoning.rawThoughtText.match(/^(.+?[.!?])(?:\s|$)/)?.[1]?.trim()
    if (firstSentence && firstSentence.length > 0 && firstSentence.length <= 120) {
      return firstSentence
    }
    // Truncate if too long or no sentence boundary found
    if (reasoning.rawThoughtText.length > 0) {
      const truncated = reasoning.rawThoughtText.slice(0, 100).trim()
      return truncated.length < reasoning.rawThoughtText.length ? truncated + '…' : truncated
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// ToolCallLifecycle — first-class tool call object with stable identity
// ---------------------------------------------------------------------------

export interface ToolCallRouteInfo {
  wasRouted: boolean
  ruleId: string | null
  originalToolName: string
  originalArgs: Record<string, unknown>
  reason: string | null
}

export interface ToolCallSafetyInfo {
  riskLevel: RiskLevel
  allowed: boolean
  ruleId: string
  reason: string
}

export type ToolCallPhase =
  | 'generating'   // LLM is still streaming the tool call
  | 'routed'       // router decision made
  | 'checked'      // safety decision made
  | 'executing'    // handler running, stdout/stderr may flow
  | 'completed'    // handler returned result
  | 'blocked'      // safety blocked before execution

export interface ToolCallLifecycle {
  /** Stable identity — uses the LLM-assigned toolCallId once available */
  id: string
  /** Provisional id used during streaming before final id is known */
  provisionalId: string | null
  /** Current phase */
  phase: ToolCallPhase
  /** Tool name as resolved (after routing) */
  toolName: string
  /** Args as resolved (after routing) */
  args: Record<string, unknown>
  /** Display command extracted from args */
  command: string
  /** Route info (null if not routed) */
  route: ToolCallRouteInfo | null
  /** Safety info (null if not yet checked) */
  safety: ToolCallSafetyInfo | null
  /** Accumulated stdout */
  stdout: string
  /** Accumulated stderr */
  stderr: string
  /** Final result text (null until completed) */
  result: string | null
  /** Whether the result is an error */
  isError: boolean
  /**
   * Explicit tool-scoped rationale — why THIS specific tool was called.
   * Must not be populated with generic assistant-level reasoning.
   * Null when no tool-specific rationale is available (the common case today).
   * Reserved for future use when the model provides per-tool-call justification.
   */
  displayReason: string | null
  /** Timestamps */
  createdAt: number
  executionStartedAt: number | null
  completedAt: number | null
}

// ---------------------------------------------------------------------------
// UsageAggregate — cumulative token/cost telemetry for a session
// ---------------------------------------------------------------------------

export interface UsageCostBreakdown {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
}

export interface UsageAggregate {
  /** Cumulative input tokens */
  input: number
  /** Cumulative output tokens */
  output: number
  /** Cumulative cache-read tokens */
  cacheRead: number
  /** Cumulative cache-write tokens */
  cacheWrite: number
  /** Cumulative total tokens */
  totalTokens: number
  /** Cumulative cost breakdown */
  cost: UsageCostBreakdown
  /** Number of LLM calls made */
  llmCalls: number
  /** Snapshot of the most recent LLM call */
  lastCall: {
    model: string
    provider: string
    stopReason: string
    latencyMs: number
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    totalTokens: number
    cost: UsageCostBreakdown
  } | null
}

export function createUsageAggregate(): UsageAggregate {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    llmCalls: 0,
    lastCall: null,
  }
}

// ---------------------------------------------------------------------------
// Lifecycle Events — stable, id-bearing semantic events
// ---------------------------------------------------------------------------

export type LifecycleEvent =
  // --- User ---
  | { type: 'user_turn'; id: string; content: string; timestamp: number }
  // --- Assistant ---
  | { type: 'assistant_turn_start'; id: string; reasoning: AssistantReasoningState; timestamp: number }
  | { type: 'assistant_turn_end'; id: string; reasoning: AssistantReasoningState; timestamp: number }
  // --- Tool call lifecycle (stable — after streaming completes) ---
  | { type: 'tool_call_created'; toolCall: ToolCallLifecycle }
  | { type: 'tool_call_updated'; toolCall: ToolCallLifecycle }
  | { type: 'tool_call_completed'; toolCall: ToolCallLifecycle }
  // --- Usage telemetry ---
  | { type: 'usage_updated'; usage: UsageAggregate; timestamp: number }
  // --- Queue ---
  | { type: 'queue_enqueued'; content: string; timestamp: number }
  | { type: 'queue_drained'; count: number; messages: { content: string; enqueuedAt: number }[]; injectedAt: number }
  // --- Question ---
  | { type: 'question_answered'; question: string; whyAsk: string; askedAt: number; answer: string; answeredAt: number }
  // --- Session status ---
  | { type: 'blocked_enter'; reason: 'waiting_user' | 'interrupted' | 'pending_input'; question?: string; questionDetail?: QuestionDetail; reasoning?: AssistantReasoningState; timestamp: number }
  | { type: 'blocked_exit'; timestamp: number }
  | { type: 'session_done'; success: boolean; text?: string; error?: string; timestamp: number }
  // --- Command feedback (slash commands, not LLM output) ---
  | { type: 'command_feedback'; success: boolean; message: string; timestamp: number }
  // --- Interrupt chain ---
  | { type: 'interrupt_requested'; source: 'sigint' | 'api'; timestamp: number }
  | { type: 'interrupt_observed'; requestedAt: number; observedAt: number; source: 'sigint' | 'api'; latencyMs: number; timestamp: number }
  // --- Context window ---
  | { type: 'context_truncated'; droppedCount: number; droppedTokens: number; budget: { total: number; systemPrompt: number; tools: number; reserved: number; availableForMessages: number; messagesBeforeTruncation: number; messagesAfterTruncation: number }; timestamp: number }
  // --- Checkpoint ---
  | { type: 'checkpoint_created'; checkpointId: string; strategy: string; fileCount: number; hasGit: boolean; timestamp: number }
  | { type: 'checkpoint_undone'; checkpointId: string; restoredFileCount: number; gitRestored: boolean; timestamp: number }

// ---------------------------------------------------------------------------
// QuestionDetail — full question metadata for UI rendering
// ---------------------------------------------------------------------------

export interface QuestionDetail {
  question: string
  whyAsk?: string
  options?: string[]
  expectedAnswerFormat?: string
  defaultPlanIfNoAnswer?: string
}

// ---------------------------------------------------------------------------
// Helper: create a fresh ToolCallLifecycle
// ---------------------------------------------------------------------------

let _nextProvisionalId = 0

export function createToolCallLifecycle(opts: {
  id?: string
  provisionalId?: string
  toolName: string
  args: Record<string, unknown>
  command: string
}): ToolCallLifecycle {
  const provisionalId = opts.provisionalId ?? `prov-${++_nextProvisionalId}`
  return {
    id: opts.id ?? provisionalId,
    provisionalId: opts.id ? null : provisionalId,
    phase: 'generating',
    toolName: opts.toolName,
    args: opts.args,
    command: opts.command,
    route: null,
    safety: null,
    stdout: '',
    stderr: '',
    result: null,
    isError: false,
    displayReason: null,
    createdAt: Date.now(),
    executionStartedAt: null,
    completedAt: null,
  }
}

/** Reset provisional id counter (for testing) */
export function _resetProvisionalIdCounter(): void {
  _nextProvisionalId = 0
}
