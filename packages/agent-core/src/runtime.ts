import { streamSimple } from '@mariozechner/pi-ai'
import type {
  Api,
  AssistantMessage,
  CacheRetention,
  Context,
  Message,
  Model,
  SimpleStreamOptions,
  Tool,
  ToolCall,
  ToolResultMessage,
} from '@mariozechner/pi-ai'
import type { AgentEvent, ToolHandler } from './react-loop.js'
import { ASK_USER_QUESTION_TOOL_NAME, askUserQuestionTool } from './tools/ask-user.js'
import type { PendingQuestion, ResolvedQuestion } from './tools/ask-user.js'
import type { ToolRouteDecision } from './tool-router.js'
import { ToolRouter } from './tool-router.js'
import type { ToolSafetyDecision } from './tool-safety.js'
import { ToolSafetyPolicy } from './tool-safety.js'
import type { LifecycleEvent, ToolCallLifecycle } from './events.js'
import { createToolCallLifecycle, createReasoningState, projectDisplayReason, createUsageAggregate } from './events.js'
import type { AssistantReasoningState, UsageAggregate } from './events.js'
import type { SessionSnapshot } from './session-snapshot.js'
import { resolveResumeState } from './session-snapshot.js'
import type { ProviderStreamTraceEvent } from './trace.js'

// ---------------------------------------------------------------------------
// Runtime state — current control phase of the runtime
// ---------------------------------------------------------------------------

/**
 * IDLE        – runtime created, no execution started
 * STREAMING   – LLM stream in progress
 * TOOL_EXEC   – executing tool calls
 * BLOCKED     – execution paused at a safe boundary, waiting for external input
 * READY       – last burst completed, session alive, ready for next turn
 *
 * Note: success/error are burst outcomes (returned from run()), not runtime states.
 * After any burst completes, the runtime transitions to READY.
 */
export type RuntimeState =
  | 'IDLE'
  | 'STREAMING'
  | 'TOOL_EXEC'
  | 'BLOCKED'
  | 'READY'

const VALID_TRANSITIONS: Record<RuntimeState, readonly RuntimeState[]> = {
  IDLE: ['STREAMING', 'BLOCKED'],
  STREAMING: ['TOOL_EXEC', 'BLOCKED', 'READY'],
  TOOL_EXEC: ['STREAMING', 'BLOCKED', 'READY'],
  BLOCKED: ['STREAMING'],
  READY: ['STREAMING'],
} as const

// ---------------------------------------------------------------------------
// Execution outcome — what a single run() burst returns
// ---------------------------------------------------------------------------

/**
 * Each `run()` call drives the runtime until it hits a boundary.
 * The outcome tells the caller *why* it stopped.
 */
export interface OutcomeSuccess {
  type: 'success'
  text: string
}

export interface OutcomeError {
  type: 'error'
  error: string
}

export interface OutcomeBlocked {
  type: 'blocked'
  reason: 'pending_input' | 'interrupted' | 'waiting_user'
}

export type RunOutcome = OutcomeSuccess | OutcomeError | OutcomeBlocked

// ---------------------------------------------------------------------------
// Partial assistant message holder
// ---------------------------------------------------------------------------

export interface PartialAssistant {
  /** Content blocks accumulated so far from streaming deltas */
  textChunks: string[]
  /** Tool calls completed within this partial turn */
  toolCalls: ToolCall[]
}

// ---------------------------------------------------------------------------
// Runtime options (superset of what runAgent used to take)
// ---------------------------------------------------------------------------

export type ReasoningLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

export interface RuntimeOptions<TApi extends Api = Api> {
  model: Model<TApi>
  systemPrompt: string
  tools: Tool[]
  toolHandlers: Map<string, ToolHandler>
  apiKey: string
  maxSteps?: number
  reasoningLevel?: ReasoningLevel
  streamOptions?: Omit<SimpleStreamOptions, 'apiKey'>
  onEvent?: (event: AgentEvent) => void
  onLifecycleEvent?: (event: LifecycleEvent) => void
  router?: ToolRouter
  safetyPolicy?: ToolSafetyPolicy
  /** Session ID for prompt caching — providers that support session-based caching will use this */
  sessionId?: string
  /** Cache retention preference. Defaults to 'short' if sessionId is set. */
  cacheRetention?: CacheRetention
  /** Hook for provider stream events — used by trace recorder, does not affect runtime behavior */
  onProviderStreamEvent?: (event: ProviderStreamTraceEvent) => void
}

// ---------------------------------------------------------------------------
// AgentRuntime — long-lived, resumable execution session
// ---------------------------------------------------------------------------

export class AgentRuntime<TApi extends Api = Api> {
  // --- Session state (survives across run() bursts) ---
  readonly messages: Message[] = []
  private _state: RuntimeState = 'IDLE'
  private _burstStepCount = 0
  private _sessionStepCount = 0
  private _pendingInbound: Message[] = []
  private _partial: PartialAssistant | null = null
  private _pendingQuestion: PendingQuestion | null = null
  private _waitingUserAnswered = false
  private _resolvedQuestions: ResolvedQuestion[] = []
  private _lastOutcome: RunOutcome | null = null
  private _assistantTurnId: string | null = null
  private _assistantTurnCounter = 0
  private _currentReasoning: AssistantReasoningState | null = null

  // --- Interrupt control ---
  private _interruptRequested = false
  private _abortController: AbortController | null = null

  // --- Config (immutable after construction) ---
  private readonly model: Model<TApi>
  private readonly systemPrompt: string
  private readonly tools: Tool[]
  private readonly toolHandlers: Map<string, ToolHandler>
  private readonly apiKey: string
  private readonly maxSteps: number
  private readonly streamOptions?: Omit<SimpleStreamOptions, 'apiKey'>
  private readonly emit: (event: AgentEvent) => void
  private readonly emitLifecycle: (event: LifecycleEvent) => void
  private readonly router: ToolRouter
  private readonly safetyPolicy: ToolSafetyPolicy
  private readonly _sessionId: string | undefined
  private readonly _cacheRetention: CacheRetention | undefined
  private readonly emitProviderStream: ((event: ProviderStreamTraceEvent) => void) | undefined

  // --- Reasoning level (mutable at runtime) ---
  private _reasoningLevel: ReasoningLevel

  // --- Usage telemetry (observability side-channel) ---
  private _usageAggregate: UsageAggregate = createUsageAggregate()

  // --- Route records (observability side-channel) ---
  private readonly _routeRecords: ToolRouteDecision[] = []

  // --- Safety records (observability side-channel) ---
  private readonly _safetyRecords: ToolSafetyDecision[] = []

  constructor(options: RuntimeOptions<TApi>) {
    this.model = options.model
    this.systemPrompt = options.systemPrompt
    this.tools = options.tools
    this.toolHandlers = options.toolHandlers
    this.apiKey = options.apiKey
    this.maxSteps = options.maxSteps ?? 10
    this.streamOptions = options.streamOptions
    this.emit = options.onEvent ?? (() => {})
    this.emitLifecycle = options.onLifecycleEvent ?? (() => {})
    this.router = options.router ?? new ToolRouter()
    this.safetyPolicy = options.safetyPolicy ?? new ToolSafetyPolicy()
    this._sessionId = options.sessionId
    this._cacheRetention = options.cacheRetention
    this.emitProviderStream = options.onProviderStreamEvent
    this._reasoningLevel = options.reasoningLevel ?? 'high'
  }

  // --- Public accessors ---

  get state(): RuntimeState { return this._state }
  /** Steps taken in the current/last burst (resets each burst) */
  get burstStepCount(): number { return this._burstStepCount }
  /** Cumulative steps across all bursts in this session (observability only) */
  get sessionStepCount(): number { return this._sessionStepCount }
  /** @deprecated Use burstStepCount or sessionStepCount */
  get stepCount(): number { return this._sessionStepCount }
  get partial(): PartialAssistant | null { return this._partial }
  get interruptRequested(): boolean { return this._interruptRequested }
  get pendingQuestion(): PendingQuestion | null { return this._pendingQuestion }
  get resolvedQuestions(): readonly ResolvedQuestion[] { return this._resolvedQuestions }
  get lastOutcome(): RunOutcome | null { return this._lastOutcome }
  /** Number of messages waiting in the inbound queue */
  get pendingInboundCount(): number { return this._pendingInbound.length }
  /** Preview of pending inbound user messages (for UI display) */
  get pendingInboundPreviews(): string[] {
    return this._pendingInbound
      .filter(m => m.role === 'user' && typeof m.content === 'string')
      .map(m => m.content as string)
  }
  /** Route decisions made during this session (observability side-channel) */
  get routeRecords(): readonly ToolRouteDecision[] { return this._routeRecords }
  /** Safety decisions made during this session (observability side-channel) */
  get safetyRecords(): readonly ToolSafetyDecision[] { return this._safetyRecords }
  /** Cumulative usage/cost telemetry for this session */
  get usageAggregate(): UsageAggregate { return this._usageAggregate }
  /** Current reasoning level */
  get reasoningLevel(): ReasoningLevel { return this._reasoningLevel }
  /** Update reasoning level at runtime (takes effect on next LLM call) */
  setReasoningLevel(level: ReasoningLevel): void { this._reasoningLevel = level }

  // --- Snapshot export / import ---

  /**
   * Export the current session state as a serializable snapshot.
   * Safe to call at any time — in-flight states are recorded honestly.
   * Does NOT include API keys or auth secrets.
   */
  exportSnapshot(meta: { sessionId: string; cwd: string; provider: string; model: string; createdAt?: number; checkpoints?: import('./checkpoint.js').CheckpointRecord[] }): SessionSnapshot {
    const now = Date.now()
    const isInFlight = this._state === 'STREAMING' || this._state === 'TOOL_EXEC'
    return {
      version: 1,
      sessionId: meta.sessionId,
      createdAt: meta.createdAt ?? now,
      updatedAt: now,
      cwd: meta.cwd,
      provider: meta.provider,
      model: meta.model,
      runtimeState: this._state,
      wasInFlight: isInFlight,
      messages: [...this.messages],
      pendingInbound: [...this._pendingInbound],
      pendingQuestion: this._pendingQuestion ? { ...this._pendingQuestion } : null,
      resolvedQuestions: [...this._resolvedQuestions],
      lastOutcome: this._lastOutcome ? { ...this._lastOutcome } : null,
      routeRecords: [...this._routeRecords],
      safetyRecords: [...this._safetyRecords],
      sessionStepCount: this._sessionStepCount,
      checkpoints: meta.checkpoints ?? [],
      usageAggregate: { ...this._usageAggregate, cost: { ...this._usageAggregate.cost }, lastCall: this._usageAggregate.lastCall ? { ...this._usageAggregate.lastCall, cost: { ...this._usageAggregate.lastCall.cost } } : null },
    }
  }

  /**
   * Restore runtime state from a persisted snapshot.
   * In-flight states are downgraded to a safe state.
   * Returns info about whether the state was downgraded.
   */
  hydrateFromSnapshot(snapshot: SessionSnapshot): {
    wasDowngraded: boolean
    interruptedDuring: RuntimeState | null
  } {
    const { state, wasDowngraded, interruptedDuring } = resolveResumeState(snapshot)

    // Restore conversation
    this.messages.length = 0
    this.messages.push(...snapshot.messages)

    // Restore queue
    this._pendingInbound = [...snapshot.pendingInbound]

    // Restore question
    this._pendingQuestion = snapshot.pendingQuestion ? { ...snapshot.pendingQuestion } : null

    // Restore side channels
    this._resolvedQuestions = [...snapshot.resolvedQuestions]
    this._lastOutcome = snapshot.lastOutcome ? { ...snapshot.lastOutcome } : null
    this._routeRecords.length = 0
    this._routeRecords.push(...snapshot.routeRecords)
    this._safetyRecords.length = 0
    this._safetyRecords.push(...snapshot.safetyRecords)

    // Restore counters
    this._sessionStepCount = snapshot.sessionStepCount

    // Restore usage telemetry
    if (snapshot.usageAggregate) {
      this._usageAggregate = { ...snapshot.usageAggregate, cost: { ...snapshot.usageAggregate.cost }, lastCall: snapshot.usageAggregate.lastCall ? { ...snapshot.usageAggregate.lastCall, cost: { ...snapshot.usageAggregate.lastCall.cost } } : null }
    }

    // Set FSM state (may be downgraded from in-flight)
    this._state = state

    return { wasDowngraded, interruptedDuring }
  }

  // --- Inbound message injection ---

  /**
   * Enqueue a raw message to be injected at the next safe boundary.
   */
  enqueue(message: Message): void {
    this._pendingInbound.push(message)
  }

  /**
   * Convenience: enqueue a user message by content string.
   */
  enqueueUserMessage(content: string): void {
    this.enqueue({ role: 'user', content, timestamp: Date.now() })
  }

  // --- Interrupt control ---

  /**
   * Request the runtime to interrupt at the next safe boundary.
   * - If streaming: aborts the LLM stream, preserves partial output, enters BLOCKED.
   * - If in tool exec: waits for current tool to finish, then stops at boundary.
   * - If IDLE/BLOCKED: sets the flag so the next run() will immediately block.
   */
  requestInterrupt(): void {
    this._interruptRequested = true
    // If currently streaming, signal abort to the LLM stream
    this._abortController?.abort()
  }

  // --- Pending question control ---

  /**
   * Provide the user's answer to a pending AskUserQuestion.
   * The answer enters message history as a normal user message.
   * Question-answer correlation is preserved in the runtime side channel,
   * not via toolResult role.
   */
  answerPendingQuestion(answer: string): void {
    if (!this._pendingQuestion) {
      throw new Error('No pending question to answer')
    }
    if (this._state !== 'BLOCKED') {
      throw new Error(`Cannot answer question in state: ${this._state}`)
    }

    const answeredAt = Date.now()

    // Emit question_answered lifecycle event
    this.emitLifecycle({
      type: 'question_answered',
      question: this._pendingQuestion.question,
      whyAsk: this._pendingQuestion.whyAsk,
      askedAt: this._pendingQuestion.askedAt,
      answer,
      answeredAt,
    })

    // Record correlation in side channel before clearing
    this._resolvedQuestions.push({
      question: this._pendingQuestion,
      answer,
      resolvedAt: answeredAt,
    })

    // User answer enters history as a normal user message
    this.messages.push({
      role: 'user',
      content: answer,
      timestamp: answeredAt,
    })
    this.emitLifecycle({ type: 'user_turn', id: `user-${answeredAt}`, content: answer, timestamp: answeredAt })

    this._pendingQuestion = null
    this._waitingUserAnswered = true
  }

  // --- FSM helpers ---

  private transition(next: RuntimeState): void {
    const allowed = VALID_TRANSITIONS[this._state]
    if (!allowed.includes(next)) {
      throw new Error(`Invalid state transition: ${this._state} -> ${next}`)
    }
    this._state = next
  }

  private drainPending(): boolean {
    if (this._pendingInbound.length === 0) return false
    const drained = [...this._pendingInbound]
    const injectedAt = Date.now()
    this.messages.push(...drained)
    this._pendingInbound = []
    // Merge all user messages into a single user_turn
    const userParts = drained
      .filter(m => m.role === 'user' && typeof m.content === 'string')
      .map(m => m.content as string)
    if (userParts.length > 0) {
      const merged = userParts.join('\n')
      this.emitLifecycle({ type: 'user_turn', id: `user-${injectedAt}`, content: merged, timestamp: injectedAt })
    }
    this.emitLifecycle({
      type: 'queue_drained',
      count: drained.length,
      messages: drained.map(m => ({
        content: typeof m.content === 'string' ? m.content : '[non-text]',
        enqueuedAt: m.timestamp ?? injectedAt,
      })),
      injectedAt,
    })
    return true
  }

  /**
   * Check interrupt flag and transition to BLOCKED if set.
   * Returns the blocked outcome, or null if not interrupted.
   * Clears the flag after consuming it.
   */
  private consumeInterrupt(): OutcomeBlocked | null {
    if (!this._interruptRequested) return null
    this._interruptRequested = false
    this.transition('BLOCKED')
    return { type: 'blocked', reason: 'interrupted' }
  }

  /**
   * Reset burst step counter. Called at the start of every new burst.
   */
  private resetBurst(): void {
    this._burstStepCount = 0
  }

  // --- Core execution burst ---

  async run(): Promise<RunOutcome> {
    // Resume from BLOCKED
    if (this._state === 'BLOCKED') {
      // These are re-checks of an already-blocked state, not new bursts.
      // They do not overwrite lastOutcome.
      if (this._interruptRequested) {
        this._interruptRequested = false
        return { type: 'blocked', reason: 'interrupted' }
      }
      if (this._waitingUserAnswered) {
        this._waitingUserAnswered = false
        this.resetBurst()
        this.drainPending()
        this.transition('STREAMING')
      } else if (this._pendingQuestion) {
        return { type: 'blocked', reason: 'waiting_user' }
      } else if (this._pendingInbound.length === 0) {
        return { type: 'blocked', reason: 'pending_input' }
      } else {
        this.resetBurst()
        this.drainPending()
        this.transition('STREAMING')
      }
    }

    // First call: IDLE -> STREAMING (only if there's input)
    if (this._state === 'IDLE') {
      if (this._interruptRequested) {
        this._interruptRequested = false
        this.transition('BLOCKED')
        return this.finishBurst({ type: 'blocked', reason: 'interrupted' })
      }
      if (this._pendingInbound.length === 0 && this.messages.length === 0) {
        // No input at all — don't start an empty burst
        return { type: 'blocked', reason: 'pending_input' }
      }
      this.resetBurst()
      this.drainPending()
      this.transition('STREAMING')
    }

    // Next turn from READY state
    if (this._state === 'READY') {
      if (this._pendingInbound.length === 0) {
        // No new work — don't overwrite lastOutcome
        return { type: 'blocked', reason: 'pending_input' }
      }
      this.resetBurst()
      this.drainPending()
      this.transition('STREAMING')
    }

    if (this._state !== 'STREAMING') {
      return this.finishBurst({ type: 'error', error: `Cannot run() in state: ${this._state}` })
    }

    // --- Main execution loop ---
    while (this._state === 'STREAMING') {
      this._burstStepCount++
      this._sessionStepCount++
      this.emit({ type: 'step_start', step: this._burstStepCount })
      this._assistantTurnId = `assistant-${++this._assistantTurnCounter}`
      this._currentReasoning = createReasoningState()
      this.emitLifecycle({ type: 'assistant_turn_start', id: this._assistantTurnId, reasoning: { ...this._currentReasoning }, timestamp: Date.now() })

      if (this._burstStepCount > this.maxSteps) {
        this.transition('READY')
        const error = `Max steps (${this.maxSteps}) exceeded`
        this.emit({ type: 'error', error })
        const result = { type: 'error' as const, error, messages: this.messages, steps: this._burstStepCount }
        this.emit({ type: 'done', result })
        return this.finishBurst({ type: 'error', error })
      }

      // --- SAFE INJECTION POINT: before each LLM call ---
      this.drainPending()
      const interrupted = this.consumeInterrupt()
      if (interrupted) return this.finishBurst(interrupted)

      // Set up abort controller for this streaming turn
      this._abortController = new AbortController()

      const context: Context = {
        systemPrompt: this.systemPrompt,
        messages: this.messages,
        tools: [...this.tools, askUserQuestionTool],
      }

      const streamStartTime = Date.now()
      // Enable reasoning for models that support it, controlled by reasoningLevel
      const reasoningOpt = (this.model as { reasoning?: boolean }).reasoning && this._reasoningLevel !== 'off'
        ? { reasoning: this._reasoningLevel }
        : {}
      const eventStream = streamSimple(this.model, context, {
        ...this.streamOptions,
        ...reasoningOpt,
        apiKey: this.apiKey,
        signal: this._abortController.signal,
        ...(this._sessionId ? { sessionId: this._sessionId } : {}),
        ...(this._cacheRetention ? { cacheRetention: this._cacheRetention } : this._sessionId ? { cacheRetention: 'short' as CacheRetention } : {}),
      })

      let assistantMsg: AssistantMessage | undefined
      const toolCalls: ToolCall[] = []
      this._partial = { textChunks: [], toolCalls: [] }
      let streamAborted = false
      let providerEventSeq = 0

      try {
        for await (const event of eventStream) {
          // --- Provider stream trace hook (read-only tap) ---
          if (this.emitProviderStream) {
            providerEventSeq++
            const base = {
              eventId: providerEventSeq,
              seq: 0, // assigned by recorder
              type: event.type,
              timestamp: Date.now(),
              step: this._burstStepCount,
              turnId: this._assistantTurnId,
              source: 'provider_stream' as const,
              contentIndex: null as number | null,
              toolCallId: null as string | null,
              toolName: null as string | null,
              deltaPreview: null as string | null,
              contentPreview: null as string | null,
              argsPreview: null as string | null,
              stopReason: null as string | null,
            }
            switch (event.type) {
              case 'thinking_start': case 'text_start':
                base.contentIndex = event.contentIndex; break
              case 'thinking_delta':
                base.contentIndex = event.contentIndex
                base.deltaPreview = event.delta.slice(0, 300); break
              case 'thinking_end':
                base.contentIndex = event.contentIndex
                base.contentPreview = event.content.slice(0, 300); break
              case 'text_delta':
                base.contentIndex = event.contentIndex
                base.deltaPreview = event.delta.slice(0, 300); break
              case 'text_end':
                base.contentIndex = event.contentIndex
                base.contentPreview = event.content.slice(0, 300); break
              case 'toolcall_start': case 'toolcall_delta': {
                base.contentIndex = event.contentIndex
                const pc = event.partial.content[event.contentIndex]
                if (pc?.type === 'toolCall') { base.toolName = pc.name; base.argsPreview = JSON.stringify(pc.arguments ?? {}).slice(0, 300) }
                break
              }
              case 'toolcall_end':
                base.contentIndex = event.contentIndex
                base.toolCallId = event.toolCall.id
                base.toolName = event.toolCall.name
                base.argsPreview = JSON.stringify(event.toolCall.arguments).slice(0, 300); break
              case 'done':
                base.stopReason = event.reason; break
              case 'error':
                base.stopReason = event.reason; break
            }
            this.emitProviderStream(base)
          }

          switch (event.type) {
            case 'thinking_start':
              this.emit({ type: 'thinking_start', contentIndex: event.contentIndex })
              break
            case 'thinking_delta':
              this.emit({ type: 'thinking_delta', contentIndex: event.contentIndex, delta: event.delta })
              if (this._currentReasoning) {
                this._currentReasoning.rawThoughtText += event.delta
              }
              break
            case 'thinking_end':
              this.emit({ type: 'thinking_end', contentIndex: event.contentIndex, text: event.content })
              if (this._currentReasoning) {
                this._currentReasoning.status = 'deciding'
              }
              break
            case 'text_start':
              this.emit({ type: 'text_start', contentIndex: event.contentIndex })
              break
            case 'text_delta':
              this._partial.textChunks.push(event.delta)
              this.emit({ type: 'text_delta', contentIndex: event.contentIndex, delta: event.delta })
              break
            case 'text_end':
              this.emit({ type: 'text_end', contentIndex: event.contentIndex, text: event.content })
              break
            case 'toolcall_start': {
              const pc = event.partial.content[event.contentIndex]
              if (pc?.type === 'toolCall') {
                this.emit({ type: 'toolcall_start', contentIndex: event.contentIndex, toolName: pc.name, args: pc.arguments ?? {} })
              }
              break
            }
            case 'toolcall_delta': {
              const pc = event.partial.content[event.contentIndex]
              if (pc?.type === 'toolCall') {
                this.emit({ type: 'toolcall_delta', contentIndex: event.contentIndex, toolName: pc.name, args: pc.arguments ?? {} })
              }
              break
            }
            case 'toolcall_end':
              this.emit({ type: 'toolcall_end', contentIndex: event.contentIndex, toolCall: event.toolCall })
              toolCalls.push(event.toolCall)
              this._partial.toolCalls.push(event.toolCall)
              break
            case 'done':
              assistantMsg = event.message
              break
            case 'error': {
              // If this error is from our abort, treat as interrupt not error
              if (this._interruptRequested || event.error.stopReason === 'aborted') {
                assistantMsg = event.error
                streamAborted = true
                break
              }
              this.transition('READY')
              const errMsg = event.error.errorMessage ?? 'Unknown stream error'
              this.emit({ type: 'error', error: errMsg })
              const errResult = { type: 'error' as const, error: errMsg, messages: this.messages, steps: this._burstStepCount }
              this.emit({ type: 'done', result: errResult })
              return this.finishBurst({ type: 'error', error: errMsg })
            }
          }
        }
      } catch {
        // AbortError from the stream iterator — treat as interrupt
        if (this._interruptRequested) {
          streamAborted = true
        } else {
          throw new Error('Unexpected stream iteration error')
        }
      }

      this._abortController = null

      // --- Handle stream abort (interrupt during streaming) ---
      if (streamAborted || this._interruptRequested) {
        // partial stays in this._partial — NOT pushed to messages
        // This is intentional: partial content is preserved but not committed
        this._interruptRequested = false
        this.transition('BLOCKED')
        return this.finishBurst({ type: 'blocked', reason: 'interrupted' })
      }

      if (!assistantMsg) {
        assistantMsg = await eventStream.result()
      }

      // Commit assistant message to history, clear partial
      this.messages.push(assistantMsg)
      this._partial = null

      // --- Accumulate usage telemetry ---
      if (assistantMsg.usage) {
        const u = assistantMsg.usage
        const latencyMs = Date.now() - streamStartTime
        this._usageAggregate.input += u.input
        this._usageAggregate.output += u.output
        this._usageAggregate.cacheRead += u.cacheRead
        this._usageAggregate.cacheWrite += u.cacheWrite
        this._usageAggregate.totalTokens += u.totalTokens
        this._usageAggregate.cost.input += u.cost.input
        this._usageAggregate.cost.output += u.cost.output
        this._usageAggregate.cost.cacheRead += u.cost.cacheRead
        this._usageAggregate.cost.cacheWrite += u.cost.cacheWrite
        this._usageAggregate.cost.total += u.cost.total
        this._usageAggregate.llmCalls++
        this._usageAggregate.lastCall = {
          model: assistantMsg.model ?? '',
          provider: String(assistantMsg.provider ?? ''),
          stopReason: assistantMsg.stopReason,
          latencyMs,
          input: u.input,
          output: u.output,
          cacheRead: u.cacheRead,
          cacheWrite: u.cacheWrite,
          totalTokens: u.totalTokens,
          cost: { ...u.cost },
        }
        this.emitLifecycle({ type: 'usage_updated', usage: { ...this._usageAggregate, cost: { ...this._usageAggregate.cost }, lastCall: { ...this._usageAggregate.lastCall } }, timestamp: Date.now() })
      }
      if (this._assistantTurnId) {
        if (this._currentReasoning) {
          this._currentReasoning.status = 'completed'
        }
        this.emitLifecycle({ type: 'assistant_turn_end', id: this._assistantTurnId, reasoning: { ...(this._currentReasoning ?? createReasoningState()) }, timestamp: Date.now() })
      }

      // Decide next state
      if (assistantMsg.stopReason === 'toolUse' && toolCalls.length > 0) {
        this.transition('TOOL_EXEC')

        for (const tc of toolCalls) {
          // --- Intercept AskUserQuestion control tool ---
          if (tc.name === ASK_USER_QUESTION_TOOL_NAME) {
            if (this._pendingQuestion) {
              // Guard: only one pending question at a time
              this.transition('READY')
              const error = 'AskUserQuestion called while another question is already pending'
              this.emit({ type: 'error', error })
              return this.finishBurst({ type: 'error', error })
            }
            const args = tc.arguments as Record<string, unknown>
            this._pendingQuestion = {
              toolCallId: tc.id,
              question: args.question as string,
              whyAsk: args.why_ask as string,
              expectedAnswerFormat: args.expected_answer_format as string | undefined,
              defaultPlanIfNoAnswer: args.default_plan_if_no_answer as string | undefined,
              options: args.options as string[] | undefined,
              askedAt: Date.now(),
            }
            this.emit({ type: 'waiting_user', question: this._pendingQuestion })
            if (this._currentReasoning) {
              this._currentReasoning.status = 'blocked'
            }
            this.emitLifecycle({
              type: 'blocked_enter',
              reason: 'waiting_user',
              question: this._pendingQuestion.question,
              questionDetail: {
                question: this._pendingQuestion.question,
                whyAsk: this._pendingQuestion.whyAsk,
                options: this._pendingQuestion.options,
                expectedAnswerFormat: this._pendingQuestion.expectedAnswerFormat,
                defaultPlanIfNoAnswer: this._pendingQuestion.defaultPlanIfNoAnswer,
              },
              reasoning: this._currentReasoning ? { ...this._currentReasoning } : undefined,
              timestamp: Date.now(),
            })
            this.transition('BLOCKED')
            return this.finishBurst({ type: 'blocked', reason: 'waiting_user' }, true)
          }

          // --- Route the tool call through the router ---
          if (this._currentReasoning) {
            this._currentReasoning.status = 'acting'
          }
          const lifecycle = createToolCallLifecycle({
            id: tc.id,
            toolName: tc.name,
            args: tc.arguments,
            command: extractCommandForDisplay(tc.name, tc.arguments),
          })
          // displayReason is reserved for explicit tool-scoped rationale only.
          // Generic assistant-level reasoning belongs in the assistant lane, not here.
          this.emitLifecycle({ type: 'tool_call_created', toolCall: { ...lifecycle } })

          const decision = this.router.route(tc.name, tc.arguments)

          if (decision.wasRouted) {
            this._routeRecords.push(decision)
            this.emit({
              type: 'tool_routed',
              ruleId: decision.ruleId!,
              originalToolName: decision.originalToolName,
              originalArgs: decision.originalArgs,
              resolvedToolName: decision.resolvedToolName,
              resolvedArgs: decision.resolvedArgs,
              reason: decision.reason!,
            })
            lifecycle.route = {
              wasRouted: true,
              ruleId: decision.ruleId,
              originalToolName: decision.originalToolName,
              originalArgs: decision.originalArgs,
              reason: decision.reason,
            }
            lifecycle.toolName = decision.resolvedToolName
            lifecycle.args = decision.resolvedArgs
            lifecycle.command = extractCommandForDisplay(decision.resolvedToolName, decision.resolvedArgs)
            lifecycle.phase = 'routed'
            this.emitLifecycle({ type: 'tool_call_updated', toolCall: { ...lifecycle } })
          }

          const execToolName = decision.resolvedToolName
          const execArgs = decision.resolvedArgs

          // --- Safety gate: assess after routing, before execution ---
          const safetyDecision = this.safetyPolicy.assess(execToolName, execArgs)
          this._safetyRecords.push(safetyDecision)
          this.emit({
            type: 'tool_safety_checked',
            toolName: execToolName,
            riskLevel: safetyDecision.riskLevel,
            allowed: safetyDecision.allowed,
            ruleId: safetyDecision.ruleId,
            reason: safetyDecision.reason,
          })
          lifecycle.safety = {
            riskLevel: safetyDecision.riskLevel,
            allowed: safetyDecision.allowed,
            ruleId: safetyDecision.ruleId,
            reason: safetyDecision.reason,
          }
          lifecycle.phase = 'checked'
          this.emitLifecycle({ type: 'tool_call_updated', toolCall: { ...lifecycle } })

          let resultText: string
          let isError: boolean

          if (safetyDecision.wasBlocked) {
            // Dangerous — do NOT call handler, return structured failure
            resultText = `ERROR [RISK_BLOCKED]: Operation blocked by safety policy. Risk level: ${safetyDecision.riskLevel}. Rule: ${safetyDecision.ruleId}. Reason: ${safetyDecision.reason}. Please use a safer approach.`
            isError = true
            lifecycle.phase = 'blocked'
            lifecycle.result = resultText
            lifecycle.isError = true
            lifecycle.completedAt = Date.now()
            this.emitLifecycle({ type: 'tool_call_completed', toolCall: { ...lifecycle } })
          } else {
            lifecycle.phase = 'executing'
            lifecycle.executionStartedAt = Date.now()
            this.emitLifecycle({ type: 'tool_call_updated', toolCall: { ...lifecycle } })
            this.emit({ type: 'tool_exec_start', toolName: execToolName, args: execArgs })

            const handler = this.toolHandlers.get(execToolName)

            if (!handler) {
              resultText = `Error: no handler registered for tool "${execToolName}"`
              isError = true
            } else {
              try {
                const result = await handler(execArgs, {
                  emitOutput: (stream, chunk) => {
                    this.emit({ type: 'tool_output_delta', toolName: execToolName, stream, chunk })
                    if (stream === 'stdout') lifecycle.stdout += chunk
                    else lifecycle.stderr += chunk
                    this.emitLifecycle({ type: 'tool_call_updated', toolCall: { ...lifecycle } })
                  },
                })
                resultText = result.output
                isError = result.isError
              } catch (e) {
                resultText = `Error executing tool "${execToolName}": ${e instanceof Error ? e.message : String(e)}`
                isError = true
              }
            }
            lifecycle.phase = 'completed'
            lifecycle.result = resultText
            lifecycle.isError = isError
            lifecycle.completedAt = Date.now()
            this.emitLifecycle({ type: 'tool_call_completed', toolCall: { ...lifecycle } })
          }

          this.emit({ type: 'tool_result', toolName: execToolName, result: resultText, isError })

          // History reflects the actually-executed tool, not the original bash call
          const toolResultMsg: ToolResultMessage = {
            role: 'toolResult',
            toolCallId: tc.id,
            toolName: execToolName,
            content: [{ type: 'text', text: resultText }],
            isError,
            timestamp: Date.now(),
          }
          this.messages.push(toolResultMsg)

          // Also rewrite the assistant message's tool call to match
          if (decision.wasRouted) {
            this.rewriteToolCallInHistory(tc.id, execToolName, execArgs)
          }

          // --- SAFE BOUNDARY: between tool executions ---
          // Check interrupt after each tool completes (not mid-tool)
          if (this._interruptRequested) {
            // Remaining tools in this batch are skipped
            this._interruptRequested = false
            this.transition('BLOCKED')
            return this.finishBurst({ type: 'blocked', reason: 'interrupted' })
          }
        }

        // --- SAFE INJECTION POINT: after tool batch completes ---
        this.drainPending()
        const toolBatchInterrupt = this.consumeInterrupt()
        if (toolBatchInterrupt) return this.finishBurst(toolBatchInterrupt)

        this.transition('STREAMING')
      } else if (assistantMsg.stopReason === 'stop') {
        this.transition('READY')
      } else {
        this.transition('READY')
        const error = `Unexpected stop reason: ${assistantMsg.stopReason}`
        this.emit({ type: 'error', error })
        const result = { type: 'error' as const, error, messages: this.messages, steps: this._burstStepCount }
        this.emit({ type: 'done', result })
        return this.finishBurst({ type: 'error', error })
      }
    }

    // Loop exited — burst completed successfully (state is READY)
    const text = this.extractFinalText()
    const result = { type: 'success' as const, text, messages: this.messages, steps: this._burstStepCount }
    this.emit({ type: 'done', result })
    return this.finishBurst({ type: 'success', text })
  }

  /**
   * Record the outcome and return it.
   * @param skipLifecycle - if true, don't emit lifecycle event (caller already did)
   */
  private finishBurst(outcome: RunOutcome, skipLifecycle = false): RunOutcome {
    this._lastOutcome = outcome
    if (skipLifecycle) return outcome
    // Emit lifecycle for terminal states
    if (outcome.type === 'blocked') {
      this.emitLifecycle({ type: 'blocked_enter', reason: outcome.reason, reasoning: this._currentReasoning ? { ...this._currentReasoning } : undefined, timestamp: Date.now() })
    } else if (outcome.type === 'success') {
      this.emitLifecycle({ type: 'session_done', success: true, text: outcome.text, timestamp: Date.now() })
    } else if (outcome.type === 'error') {
      this.emitLifecycle({ type: 'session_done', success: false, error: outcome.error, timestamp: Date.now() })
    }
    return outcome
  }

  // --- Helpers ---

  /**
   * Rewrite a tool call in the most recent assistant message so that
   * the conversation history reflects the actually-executed tool.
   */
  private rewriteToolCallInHistory(toolCallId: string, newName: string, newArgs: Record<string, unknown>): void {
    // Walk backwards to find the assistant message containing this tool call
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i]
      if (msg.role !== 'assistant') continue
      const assistantMsg = msg as AssistantMessage
      for (const block of assistantMsg.content) {
        if (block.type === 'toolCall' && block.id === toolCallId) {
          // Mutate in place — this is intentional for history consistency
          ;(block as { name: string }).name = newName
          ;(block as { arguments: Record<string, unknown> }).arguments = newArgs
          return
        }
      }
    }
  }

  private extractFinalText(): string {
    const lastMsg = this.messages.findLast(
      (m): m is AssistantMessage => m.role === 'assistant',
    )
    return lastMsg?.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map((c) => c.text)
      .join('') ?? ''
  }
}

// ---------------------------------------------------------------------------
// Minimal command extraction for lifecycle display (no external deps)
// ---------------------------------------------------------------------------

function extractCommandForDisplay(toolName: string, args: Record<string, unknown>): string {
  if (toolName === 'bash') return typeof args.command === 'string' ? args.command : toolName
  if (typeof args.file_path === 'string') return args.file_path
  if (typeof args.query === 'string') return args.query
  if (typeof args.path === 'string') return args.path
  return toolName
}
