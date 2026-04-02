import { streamSimple } from '@mariozechner/pi-ai'
import type {
  Api,
  AssistantMessage,
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

export interface RuntimeOptions<TApi extends Api = Api> {
  model: Model<TApi>
  systemPrompt: string
  tools: Tool[]
  toolHandlers: Map<string, ToolHandler>
  apiKey: string
  maxSteps?: number
  streamOptions?: Omit<SimpleStreamOptions, 'apiKey'>
  onEvent?: (event: AgentEvent) => void
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

  constructor(options: RuntimeOptions<TApi>) {
    this.model = options.model
    this.systemPrompt = options.systemPrompt
    this.tools = options.tools
    this.toolHandlers = options.toolHandlers
    this.apiKey = options.apiKey
    this.maxSteps = options.maxSteps ?? 10
    this.streamOptions = options.streamOptions
    this.emit = options.onEvent ?? (() => {})
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

    // Record correlation in side channel before clearing
    this._resolvedQuestions.push({
      question: this._pendingQuestion,
      answer,
      resolvedAt: Date.now(),
    })

    // User answer enters history as a normal user message
    this.messages.push({
      role: 'user',
      content: answer,
      timestamp: Date.now(),
    })

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
    this.messages.push(...this._pendingInbound)
    this._pendingInbound = []
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

      const eventStream = streamSimple(this.model, context, {
        ...this.streamOptions,
        apiKey: this.apiKey,
        signal: this._abortController.signal,
      })

      let assistantMsg: AssistantMessage | undefined
      const toolCalls: ToolCall[] = []
      this._partial = { textChunks: [], toolCalls: [] }
      let streamAborted = false

      try {
        for await (const event of eventStream) {
          switch (event.type) {
            case 'thinking_start':
              this.emit({ type: 'thinking_start', contentIndex: event.contentIndex })
              break
            case 'thinking_delta':
              this.emit({ type: 'thinking_delta', contentIndex: event.contentIndex, delta: event.delta })
              break
            case 'thinking_end':
              this.emit({ type: 'thinking_end', contentIndex: event.contentIndex, text: event.content })
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
              this.emit({ type: 'toolcall_end', toolCall: event.toolCall })
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
            }
            this.emit({ type: 'waiting_user', question: this._pendingQuestion })
            this.transition('BLOCKED')
            return this.finishBurst({ type: 'blocked', reason: 'waiting_user' })
          }

          this.emit({ type: 'tool_exec_start', toolName: tc.name, args: tc.arguments })

          const handler = this.toolHandlers.get(tc.name)
          let resultText: string
          let isError: boolean

          if (!handler) {
            resultText = `Error: no handler registered for tool "${tc.name}"`
            isError = true
          } else {
            try {
              const result = await handler(tc.arguments, {
                emitOutput: (stream, chunk) => {
                  this.emit({ type: 'tool_output_delta', toolName: tc.name, stream, chunk })
                },
              })
              resultText = result.output
              isError = result.isError
            } catch (e) {
              resultText = `Error executing tool "${tc.name}": ${e instanceof Error ? e.message : String(e)}`
              isError = true
            }
          }

          this.emit({ type: 'tool_result', toolName: tc.name, result: resultText, isError })

          const toolResultMsg: ToolResultMessage = {
            role: 'toolResult',
            toolCallId: tc.id,
            toolName: tc.name,
            content: [{ type: 'text', text: resultText }],
            isError,
            timestamp: Date.now(),
          }
          this.messages.push(toolResultMsg)

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
   */
  private finishBurst(outcome: RunOutcome): RunOutcome {
    this._lastOutcome = outcome
    return outcome
  }

  // --- Helpers ---

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
