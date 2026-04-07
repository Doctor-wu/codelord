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
import { createToolCallLifecycle, createReasoningState, projectDisplayReason } from './events.js'
import type { AssistantReasoningState, UsageAggregate } from './events.js'
import type { SessionSnapshot } from './session-snapshot.js'
import { resolveResumeState } from './session-snapshot.js'
import type { ProviderStreamTraceEvent } from './trace.js'
import { MessageManager } from './message-manager.js'
import { UsageTracker } from './usage-tracker.js'
import { InterruptController } from './interrupt-controller.js'
import { ReasoningManager } from './reasoning-manager.js'
import type { ReasoningLevel } from './reasoning-manager.js'
import type { ContextWindowConfig } from './context-window.js'
import { DEFAULT_CONTEXT_WINDOW, estimateTokens, truncateMessages } from './context-window.js'
import { ToolStatsTracker } from './tool-stats.js'

// Re-export ReasoningLevel so external consumers don't break
export type { ReasoningLevel } from './reasoning-manager.js'

// ---------------------------------------------------------------------------
// Runtime state — current control phase of the runtime
// ---------------------------------------------------------------------------

/**
 * IDLE        – runtime created, no execution started
 * STREAMING   – LLM stream in progress
 * TOOL_EXEC   – executing tool calls
 * BLOCKED     – execution paused at a safe boundary, waiting for external input
 * READY       – last burst completed, session alive, ready for next turn
 */
export type RuntimeState =
  | 'IDLE'
  | 'STREAMING'
  | 'TOOL_EXEC'
  | 'BLOCKED'
  | 'READY'

const VALID_TRANSITIONS: Record<RuntimeState, readonly RuntimeState[]> = {
  IDLE: ['STREAMING', 'BLOCKED', 'READY'],
  STREAMING: ['TOOL_EXEC', 'BLOCKED', 'READY'],
  TOOL_EXEC: ['STREAMING', 'BLOCKED', 'READY'],
  BLOCKED: ['STREAMING', 'READY'],
  READY: ['STREAMING'],
} as const

// ---------------------------------------------------------------------------
// Execution outcome — what a single run() burst returns
// ---------------------------------------------------------------------------

export interface OutcomeSuccess { type: 'success'; text: string }
export interface OutcomeError { type: 'error'; error: string }
export interface OutcomeBlocked { type: 'blocked'; reason: 'pending_input' | 'waiting_user' }
export interface OutcomeInterrupted { type: 'interrupted' }
export type RunOutcome = OutcomeSuccess | OutcomeError | OutcomeBlocked | OutcomeInterrupted

// ---------------------------------------------------------------------------
// Partial assistant message holder
// ---------------------------------------------------------------------------

export interface PartialAssistant {
  textChunks: string[]
  toolCalls: ToolCall[]
}

// ---------------------------------------------------------------------------
// Runtime options
// ---------------------------------------------------------------------------

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
  sessionId?: string
  cacheRetention?: CacheRetention
  onProviderStreamEvent?: (event: ProviderStreamTraceEvent) => void
  contextWindow?: ContextWindowConfig
}

// ---------------------------------------------------------------------------
// AgentRuntime — long-lived, resumable execution session
// ---------------------------------------------------------------------------

export class AgentRuntime<TApi extends Api = Api> {
  // --- Managers ---
  private readonly msgMgr = new MessageManager()
  private readonly usageTracker = new UsageTracker()
  private readonly interruptCtrl = new InterruptController()
  private readonly toolStatsTracker = new ToolStatsTracker()
  private readonly reasoningMgr: ReasoningManager

  // --- Session state (survives across run() bursts) ---
  private _state: RuntimeState = 'IDLE'
  private _burstStepCount = 0
  private _sessionStepCount = 0
  private _partial: PartialAssistant | null = null
  private _pendingQuestion: PendingQuestion | null = null
  private _waitingUserAnswered = false
  private _resolvedQuestions: ResolvedQuestion[] = []
  private _lastOutcome: RunOutcome | null = null
  private _assistantTurnId: string | null = null
  private _assistantTurnCounter = 0

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
  private readonly contextWindowConfig: ContextWindowConfig

  // --- Observability side-channels ---
  private readonly _routeRecords: ToolRouteDecision[] = []
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
    this.contextWindowConfig = options.contextWindow ?? DEFAULT_CONTEXT_WINDOW
    this.reasoningMgr = new ReasoningManager(options.reasoningLevel ?? 'high')
  }

  // --- Public accessors (unchanged API surface) ---

  get messages(): Message[] { return this.msgMgr.messages }
  get state(): RuntimeState { return this._state }
  get burstStepCount(): number { return this._burstStepCount }
  get sessionStepCount(): number { return this._sessionStepCount }
  /** @deprecated Use burstStepCount or sessionStepCount */
  get stepCount(): number { return this._sessionStepCount }
  get partial(): PartialAssistant | null { return this._partial }
  get interruptRequested(): boolean { return this.interruptCtrl.isRequested }
  get pendingQuestion(): PendingQuestion | null { return this._pendingQuestion }
  get resolvedQuestions(): readonly ResolvedQuestion[] { return this._resolvedQuestions }
  get lastOutcome(): RunOutcome | null { return this._lastOutcome }
  get pendingInboundCount(): number { return this.msgMgr.pendingInboundCount }
  get pendingInboundPreviews(): string[] { return this.msgMgr.pendingInboundPreviews }
  get routeRecords(): readonly ToolRouteDecision[] { return this._routeRecords }
  get safetyRecords(): readonly ToolSafetyDecision[] { return this._safetyRecords }
  get usageAggregate(): UsageAggregate { return this.usageTracker.aggregate }
  get toolStats(): ToolStatsTracker { return this.toolStatsTracker }
  get reasoningLevel(): ReasoningLevel { return this.reasoningMgr.level }
  setReasoningLevel(level: ReasoningLevel): void { this.reasoningMgr.setLevel(level) }

  // --- Snapshot export / import ---

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
      pendingInbound: this.msgMgr.exportPending(),
      pendingQuestion: this._pendingQuestion ? { ...this._pendingQuestion } : null,
      resolvedQuestions: [...this._resolvedQuestions],
      lastOutcome: this._lastOutcome ? { ...this._lastOutcome } : null,
      routeRecords: [...this._routeRecords],
      safetyRecords: [...this._safetyRecords],
      sessionStepCount: this._sessionStepCount,
      checkpoints: meta.checkpoints ?? [],
      usageAggregate: this.usageTracker.exportSnapshot(),
      toolStats: this.toolStatsTracker.exportSnapshot(),
    }
  }

  hydrateFromSnapshot(snapshot: SessionSnapshot): { wasDowngraded: boolean; interruptedDuring: RuntimeState | null } {
    const { state, wasDowngraded, interruptedDuring } = resolveResumeState(snapshot)

    this.msgMgr.hydrate(snapshot.messages, snapshot.pendingInbound)
    this._pendingQuestion = snapshot.pendingQuestion ? { ...snapshot.pendingQuestion } : null
    this._resolvedQuestions = [...snapshot.resolvedQuestions]
    this._lastOutcome = snapshot.lastOutcome ? { ...snapshot.lastOutcome } : null
    this._routeRecords.length = 0
    this._routeRecords.push(...snapshot.routeRecords)
    this._safetyRecords.length = 0
    this._safetyRecords.push(...snapshot.safetyRecords)
    this._sessionStepCount = snapshot.sessionStepCount
    if (snapshot.usageAggregate) {
      this.usageTracker.hydrateFromSnapshot(snapshot.usageAggregate)
    }
    if (snapshot.toolStats) {
      this.toolStatsTracker.hydrateFromSnapshot(snapshot.toolStats)
    }
    this._state = state
    return { wasDowngraded, interruptedDuring }
  }

  // --- Inbound message injection (delegates to MessageManager) ---

  enqueue(message: Message): void { this.msgMgr.enqueue(message) }
  enqueueUserMessage(content: string): void { this.msgMgr.enqueueUserMessage(content) }

  // --- Interrupt control (delegates to InterruptController) ---

  requestInterrupt(): void { this.interruptCtrl.requestInterrupt() }

  // --- Pending question control ---

  answerPendingQuestion(answer: string): void {
    if (!this._pendingQuestion) throw new Error('No pending question to answer')
    if (this._state !== 'BLOCKED') throw new Error(`Cannot answer question in state: ${this._state}`)

    const answeredAt = Date.now()
    this.emitLifecycle({
      type: 'question_answered',
      question: this._pendingQuestion.question,
      whyAsk: this._pendingQuestion.whyAsk,
      askedAt: this._pendingQuestion.askedAt,
      answer,
      answeredAt,
    })
    this._resolvedQuestions.push({ question: this._pendingQuestion, answer, resolvedAt: answeredAt })
    this.messages.push({ role: 'user', content: answer, timestamp: answeredAt })
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
    const result = this.msgMgr.drain()
    if (!result) return false
    const injectedAt = Date.now()
    if (result.userParts.length > 0) {
      const merged = result.userParts.join('\n')
      this.emitLifecycle({ type: 'user_turn', id: `user-${injectedAt}`, content: merged, timestamp: injectedAt })
    }
    this.emitLifecycle({
      type: 'queue_drained',
      count: result.drained.length,
      messages: result.drained.map(m => ({
        content: typeof m.content === 'string' ? m.content : '[non-text]',
        enqueuedAt: m.timestamp ?? injectedAt,
      })),
      injectedAt,
    })
    return true
  }

  private consumeInterrupt(): OutcomeInterrupted | null {
    if (!this.interruptCtrl.consume()) return null
    this.transition('READY')
    return { type: 'interrupted' }
  }

  private resetBurst(): void { this._burstStepCount = 0 }

  // --- Core execution burst ---

  async run(): Promise<RunOutcome> {
    // Resume from BLOCKED
    if (this._state === 'BLOCKED') {
      if (this.interruptCtrl.consume()) {
        this.transition('READY')
        return { type: 'interrupted' }
      }
      if (this._waitingUserAnswered) {
        this._waitingUserAnswered = false
        this.resetBurst()
        this.drainPending()
        this.transition('STREAMING')
      } else if (this._pendingQuestion) {
        return { type: 'blocked', reason: 'waiting_user' }
      } else if (this.msgMgr.pendingInboundCount === 0) {
        return { type: 'blocked', reason: 'pending_input' }
      } else {
        this.resetBurst()
        this.drainPending()
        this.transition('STREAMING')
      }
    }

    if (this._state === 'IDLE') {
      if (this.interruptCtrl.consume()) {
        this.transition('READY')
        return this.finishBurst({ type: 'interrupted' })
      }
      if (this.msgMgr.pendingInboundCount === 0 && this.messages.length === 0) {
        return { type: 'blocked', reason: 'pending_input' }
      }
      this.resetBurst()
      this.drainPending()
      this.transition('STREAMING')
    }

    if (this._state === 'READY') {
      if (this.msgMgr.pendingInboundCount === 0) {
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
      const reasoning = this.reasoningMgr.beginTurn()
      this.emitLifecycle({ type: 'assistant_turn_start', id: this._assistantTurnId, reasoning: this.reasoningMgr.snapshot(), timestamp: Date.now() })

      if (this._burstStepCount > this.maxSteps) {
        this.transition('READY')
        const error = `Max steps (${this.maxSteps}) exceeded`
        this.emit({ type: 'error', error })
        this.emit({ type: 'done', result: { type: 'error' as const, error, messages: this.messages, steps: this._burstStepCount } })
        return this.finishBurst({ type: 'error', error })
      }

      const signal = this.interruptCtrl.createAbortSignal()

      // --- Context window truncation (only affects LLM copy, not this.messages) ---
      const allTools = [...this.tools, askUserQuestionTool]
      const systemPromptTokens = estimateTokens(this.systemPrompt)
      const toolsTokens = estimateTokens(JSON.stringify(allTools))
      const truncation = truncateMessages(
        this.messages,
        systemPromptTokens,
        toolsTokens,
        this.contextWindowConfig,
      )
      if (truncation.wasTruncated) {
        this.emitLifecycle({
          type: 'context_truncated',
          droppedCount: truncation.droppedCount,
          droppedTokens: truncation.droppedTokens,
          budget: truncation.budget,
          timestamp: Date.now(),
        })
      }

      const context: Context = {
        systemPrompt: this.systemPrompt,
        messages: truncation.messages,
        tools: allTools,
      }

      const streamStartTime = Date.now()
      const reasoningOpt = (this.model as { reasoning?: boolean }).reasoning && this.reasoningMgr.level !== 'off'
        ? { reasoning: this.reasoningMgr.level }
        : {}
      const eventStream = streamSimple(this.model, context, {
        ...this.streamOptions,
        ...reasoningOpt,
        apiKey: this.apiKey,
        signal,
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
          // Provider stream trace hook
          if (this.emitProviderStream) {
            providerEventSeq++
            this.emitProviderStreamEvent(event, providerEventSeq)
          }

          switch (event.type) {
            case 'thinking_start':
              this.emit({ type: 'thinking_start', contentIndex: event.contentIndex })
              break
            case 'thinking_delta':
              this.emit({ type: 'thinking_delta', contentIndex: event.contentIndex, delta: event.delta })
              this.reasoningMgr.appendThought(event.delta)
              break
            case 'thinking_end':
              this.emit({ type: 'thinking_end', contentIndex: event.contentIndex, text: event.content })
              this.reasoningMgr.setStatus('deciding')
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
              if (this.interruptCtrl.isRequested || event.error.stopReason === 'aborted') {
                assistantMsg = event.error
                streamAborted = true
                break
              }
              this.transition('READY')
              const errMsg = event.error.errorMessage ?? 'Unknown stream error'
              this.emit({ type: 'error', error: errMsg })
              this.emit({ type: 'done', result: { type: 'error' as const, error: errMsg, messages: this.messages, steps: this._burstStepCount } })
              return this.finishBurst({ type: 'error', error: errMsg })
            }
          }
        }
      } catch {
        if (this.interruptCtrl.isRequested) {
          streamAborted = true
        } else {
          throw new Error('Unexpected stream iteration error')
        }
      }

      this.interruptCtrl.clearAbort()

      // Handle stream abort (interrupt during streaming)
      if (streamAborted || this.interruptCtrl.isRequested) {
        this.interruptCtrl.consume()
        this.transition('READY')
        return this.finishBurst({ type: 'interrupted' })
      }

      if (!assistantMsg) {
        assistantMsg = await eventStream.result()
      }

      this.messages.push(assistantMsg)
      this._partial = null

      // Accumulate usage telemetry
      if (assistantMsg.usage) {
        const latencyMs = Date.now() - streamStartTime
        const updated = this.usageTracker.recordCall(
          assistantMsg.usage,
          assistantMsg.model ?? '',
          String(assistantMsg.provider ?? ''),
          assistantMsg.stopReason,
          latencyMs,
        )
        this.emitLifecycle({ type: 'usage_updated', usage: this.usageTracker.exportSnapshot(), timestamp: Date.now() })
      }
      if (this._assistantTurnId) {
        this.reasoningMgr.endTurn()
        this.emitLifecycle({ type: 'assistant_turn_end', id: this._assistantTurnId, reasoning: this.reasoningMgr.snapshot(), timestamp: Date.now() })
      }

      // Decide next state
      if (assistantMsg.stopReason === 'toolUse' && toolCalls.length > 0) {
        this.transition('TOOL_EXEC')

        for (const tc of toolCalls) {
          // Intercept AskUserQuestion control tool
          if (tc.name === ASK_USER_QUESTION_TOOL_NAME) {
            if (this._pendingQuestion) {
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
            this.reasoningMgr.setStatus('blocked')
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
              reasoning: this.reasoningMgr.current ? this.reasoningMgr.snapshot() : undefined,
              timestamp: Date.now(),
            })
            this.transition('BLOCKED')
            return this.finishBurst({ type: 'blocked', reason: 'waiting_user' }, true)
          }

          // Route + safety + execute
          this.reasoningMgr.setStatus('acting')
          const lifecycle = createToolCallLifecycle({
            id: tc.id, toolName: tc.name, args: tc.arguments,
            command: extractCommandForDisplay(tc.name, tc.arguments),
          })
          this.emitLifecycle({ type: 'tool_call_created', toolCall: { ...lifecycle } })

          const decision = this.router.route(tc.name, tc.arguments)
          if (decision.wasRouted) {
            this._routeRecords.push(decision)
            this.emit({ type: 'tool_routed', ruleId: decision.ruleId!, originalToolName: decision.originalToolName, originalArgs: decision.originalArgs, resolvedToolName: decision.resolvedToolName, resolvedArgs: decision.resolvedArgs, reason: decision.reason! })
            lifecycle.route = { wasRouted: true, ruleId: decision.ruleId, originalToolName: decision.originalToolName, originalArgs: decision.originalArgs, reason: decision.reason }
            lifecycle.toolName = decision.resolvedToolName
            lifecycle.args = decision.resolvedArgs
            lifecycle.command = extractCommandForDisplay(decision.resolvedToolName, decision.resolvedArgs)
            lifecycle.phase = 'routed'
            this.emitLifecycle({ type: 'tool_call_updated', toolCall: { ...lifecycle } })
          }

          const execToolName = decision.resolvedToolName
          const execArgs = decision.resolvedArgs

          // Safety gate
          const safetyDecision = this.safetyPolicy.assess(execToolName, execArgs)
          this._safetyRecords.push(safetyDecision)
          this.emit({ type: 'tool_safety_checked', toolName: execToolName, riskLevel: safetyDecision.riskLevel, allowed: safetyDecision.allowed, ruleId: safetyDecision.ruleId, reason: safetyDecision.reason })
          lifecycle.safety = { riskLevel: safetyDecision.riskLevel, allowed: safetyDecision.allowed, ruleId: safetyDecision.ruleId, reason: safetyDecision.reason }
          lifecycle.phase = 'checked'
          this.emitLifecycle({ type: 'tool_call_updated', toolCall: { ...lifecycle } })

          let resultText: string
          let isError: boolean

          if (safetyDecision.wasBlocked) {
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

          // Record tool stats
          this.toolStatsTracker.recordToolCall(execToolName, isError, resultText)
          if (decision.wasRouted && decision.ruleId) {
            this.toolStatsTracker.recordRouteHit(decision.ruleId, isError)
          }

          this.emit({ type: 'tool_result', toolName: execToolName, result: resultText, isError })
          const toolResultMsg: ToolResultMessage = {
            role: 'toolResult', toolCallId: tc.id, toolName: execToolName,
            content: [{ type: 'text', text: resultText }], isError, timestamp: Date.now(),
          }
          this.messages.push(toolResultMsg)

          if (decision.wasRouted) {
            this.rewriteToolCallInHistory(tc.id, execToolName, execArgs)
          }

          // Check interrupt after each tool
          if (this.interruptCtrl.consume()) {
            this.transition('READY')
            return this.finishBurst({ type: 'interrupted' })
          }
        }

        this.transition('STREAMING')
      } else if (assistantMsg.stopReason === 'stop') {
        this.drainPending()
        this.transition('READY')
      } else {
        this.transition('READY')
        const error = `Unexpected stop reason: ${assistantMsg.stopReason}`
        this.emit({ type: 'error', error })
        this.emit({ type: 'done', result: { type: 'error' as const, error, messages: this.messages, steps: this._burstStepCount } })
        return this.finishBurst({ type: 'error', error })
      }
    }

    const text = this.extractFinalText()
    this.emit({ type: 'done', result: { type: 'success' as const, text, messages: this.messages, steps: this._burstStepCount } })
    return this.finishBurst({ type: 'success', text })
  }

  private finishBurst(outcome: RunOutcome, skipLifecycle = false): RunOutcome {
    this._lastOutcome = outcome
    if (skipLifecycle) return outcome
    if (outcome.type === 'interrupted') {
      this.emitLifecycle({ type: 'blocked_enter', reason: 'interrupted', reasoning: this.reasoningMgr.current ? this.reasoningMgr.snapshot() : undefined, timestamp: Date.now() })
    } else if (outcome.type === 'blocked') {
      this.emitLifecycle({ type: 'blocked_enter', reason: outcome.reason, reasoning: this.reasoningMgr.current ? this.reasoningMgr.snapshot() : undefined, timestamp: Date.now() })
    } else if (outcome.type === 'success') {
      this.emitLifecycle({ type: 'session_done', success: true, text: outcome.text, timestamp: Date.now() })
    } else if (outcome.type === 'error') {
      this.emitLifecycle({ type: 'session_done', success: false, error: outcome.error, timestamp: Date.now() })
    }
    return outcome
  }

  private rewriteToolCallInHistory(toolCallId: string, newName: string, newArgs: Record<string, unknown>): void {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i]
      if (msg.role !== 'assistant') continue
      const assistantMsg = msg as AssistantMessage
      for (const block of assistantMsg.content) {
        if (block.type === 'toolCall' && block.id === toolCallId) {
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

  /** Emit a provider stream trace event (extracted to reduce run() noise). */
  private emitProviderStreamEvent(event: any, seq: number): void {
    const base = {
      eventId: seq, seq: 0, type: event.type, timestamp: Date.now(),
      step: this._burstStepCount, turnId: this._assistantTurnId, source: 'provider_stream' as const,
      contentIndex: null as number | null, toolCallId: null as string | null,
      toolName: null as string | null, deltaPreview: null as string | null,
      contentPreview: null as string | null, argsPreview: null as string | null,
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
    this.emitProviderStream!(base)
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
