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

// ---------------------------------------------------------------------------
// Tool handler registry
// ---------------------------------------------------------------------------

export interface ToolExecutionContext {
  emitOutput: (stream: 'stdout' | 'stderr', chunk: string) => void
}

export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolExecutionContext,
) => Promise<string>

// ---------------------------------------------------------------------------
// FSM state definitions
// ---------------------------------------------------------------------------

/**
 * IDLE        – loop has not started yet
 * STREAMING   – waiting for LLM stream to complete
 * TOOL_EXEC   – executing tool calls returned by LLM
 * DONE        – LLM returned stop, final answer available
 * ERROR       – unrecoverable error or max steps exceeded
 */
export type LoopState = 'IDLE' | 'STREAMING' | 'TOOL_EXEC' | 'DONE' | 'ERROR'

/**
 * Valid transitions:
 *
 *   IDLE  ──▶  STREAMING                start the loop
 *   STREAMING  ──▶  TOOL_EXEC           reason === "toolUse"
 *   STREAMING  ──▶  DONE                reason === "stop"
 *   STREAMING  ──▶  ERROR               reason === "error" | "length" | stream error
 *   TOOL_EXEC  ──▶  STREAMING           tool results appended, next LLM call
 *   TOOL_EXEC  ──▶  ERROR               maxSteps exceeded
 */
const VALID_TRANSITIONS: Record<LoopState, readonly LoopState[]> = {
  IDLE: ['STREAMING'],
  STREAMING: ['TOOL_EXEC', 'DONE', 'ERROR'],
  TOOL_EXEC: ['STREAMING', 'ERROR'],
  DONE: [],
  ERROR: [],
} as const

// ---------------------------------------------------------------------------
// Agent event types
// ---------------------------------------------------------------------------

export type AgentEvent =
  | { type: 'step_start'; step: number }
  | { type: 'thinking_start'; contentIndex: number }
  | { type: 'thinking_delta'; contentIndex: number; delta: string }
  | { type: 'thinking_end'; contentIndex: number; text: string }
  | { type: 'text_start'; contentIndex: number }
  | { type: 'text_delta'; contentIndex: number; delta: string }
  | { type: 'text_end'; contentIndex: number; text: string }
  | { type: 'toolcall_start'; contentIndex: number; toolName: string; args: Record<string, unknown> }
  | { type: 'toolcall_delta'; contentIndex: number; toolName: string; args: Record<string, unknown> }
  | { type: 'toolcall_end'; toolCall: ToolCall }
  | { type: 'tool_exec_start'; toolName: string; args: Record<string, unknown> }
  | { type: 'tool_output_delta'; toolName: string; stream: 'stdout' | 'stderr'; chunk: string }
  | { type: 'tool_result'; toolName: string; result: string; isError: boolean }
  | { type: 'done'; result: AgentResult }
  | { type: 'error'; error: string }

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface AgentSuccess {
  type: 'success'
  text: string
  messages: Message[]
  steps: number
}

export interface AgentError {
  type: 'error'
  error: string
  messages: Message[]
  steps: number
}

export type AgentResult = AgentSuccess | AgentError

// ---------------------------------------------------------------------------
// runAgent options
// ---------------------------------------------------------------------------

export interface RunAgentOptions<TApi extends Api = Api> {
  model: Model<TApi>
  systemPrompt: string
  tools: Tool[]
  toolHandlers: Map<string, ToolHandler>
  userMessage: string
  apiKey: string
  maxSteps?: number
  streamOptions?: Omit<SimpleStreamOptions, 'apiKey'>
  onEvent?: (event: AgentEvent) => void
}

// ---------------------------------------------------------------------------
// Core loop
// ---------------------------------------------------------------------------

export async function runAgent<TApi extends Api = Api>(
  options: RunAgentOptions<TApi>,
): Promise<AgentResult> {
  const {
    model,
    systemPrompt,
    tools,
    toolHandlers,
    userMessage,
    apiKey,
    maxSteps = 10,
    streamOptions,
    onEvent,
  } = options

  const emit = onEvent ?? (() => {})

  const messages: Message[] = [
    { role: 'user', content: userMessage, timestamp: Date.now() },
  ]

  const fsm = { state: 'IDLE' as LoopState }
  let step = 0

  function transition(next: LoopState): void {
    const allowed = VALID_TRANSITIONS[fsm.state]
    if (!allowed.includes(next)) {
      throw new Error(`Invalid state transition: ${fsm.state} -> ${next}`)
    }
    fsm.state = next
  }

  function makeError(error: string): AgentError {
    const result: AgentError = { type: 'error', error, messages, steps: step }
    emit({ type: 'error', error })
    emit({ type: 'done', result })
    return result
  }

  // --- Start: IDLE -> STREAMING ---
  transition('STREAMING')

  while (fsm.state === 'STREAMING') {
    step++
    emit({ type: 'step_start', step })

    // Guard: max steps
    if (step > maxSteps) {
      transition('ERROR')
      return makeError(`Max steps (${maxSteps}) exceeded`)
    }

    const context: Context = { systemPrompt, messages, tools }
    const eventStream = streamSimple(model, context, {
      ...streamOptions,
      apiKey,
    })

    let assistantMsg: AssistantMessage | undefined
    const toolCalls: ToolCall[] = []

    for await (const event of eventStream) {
      switch (event.type) {
        case 'thinking_start':
          emit({ type: 'thinking_start', contentIndex: event.contentIndex })
          break

        case 'thinking_delta':
          emit({ type: 'thinking_delta', contentIndex: event.contentIndex, delta: event.delta })
          break

        case 'thinking_end':
          emit({ type: 'thinking_end', contentIndex: event.contentIndex, text: event.content })
          break

        case 'text_start':
          emit({ type: 'text_start', contentIndex: event.contentIndex })
          break

        case 'text_delta':
          emit({ type: 'text_delta', contentIndex: event.contentIndex, delta: event.delta })
          break

        case 'text_end':
          emit({ type: 'text_end', contentIndex: event.contentIndex, text: event.content })
          break

        case 'toolcall_start': {
          const partialCall = event.partial.content[event.contentIndex]
          if (partialCall?.type === 'toolCall') {
            emit({
              type: 'toolcall_start',
              contentIndex: event.contentIndex,
              toolName: partialCall.name,
              args: partialCall.arguments ?? {},
            })
          }
          break
        }

        case 'toolcall_delta': {
          const partialCall = event.partial.content[event.contentIndex]
          if (partialCall?.type === 'toolCall') {
            emit({
              type: 'toolcall_delta',
              contentIndex: event.contentIndex,
              toolName: partialCall.name,
              args: partialCall.arguments ?? {},
            })
          }
          break
        }

        case 'toolcall_end':
          emit({ type: 'toolcall_end', toolCall: event.toolCall })
          toolCalls.push(event.toolCall)
          break

        case 'done':
          assistantMsg = event.message
          break

        case 'error':
          transition('ERROR')
          return makeError(event.error.errorMessage ?? 'Unknown stream error')
      }
    }

    // Fallback: if for-await ended without a done/error event
    if (!assistantMsg) {
      assistantMsg = await eventStream.result()
    }

    // Append the full assistant message to history
    messages.push(assistantMsg)

    // Decide next state based on stop reason
    if (assistantMsg.stopReason === 'toolUse' && toolCalls.length > 0) {
      // STREAMING -> TOOL_EXEC
      transition('TOOL_EXEC')

      // Execute each tool call
      for (const tc of toolCalls) {
        emit({ type: 'tool_exec_start', toolName: tc.name, args: tc.arguments })

        const handler = toolHandlers.get(tc.name)

        let resultText: string
        let isError: boolean

        if (!handler) {
          resultText = `Error: no handler registered for tool "${tc.name}"`
          isError = true
        } else {
          try {
            resultText = await handler(tc.arguments, {
              emitOutput: (stream, chunk) => {
                emit({ type: 'tool_output_delta', toolName: tc.name, stream, chunk })
              },
            })
            isError = false
          } catch (e) {
            resultText = `Error executing tool "${tc.name}": ${e instanceof Error ? e.message : String(e)}`
            isError = true
          }
        }

        emit({ type: 'tool_result', toolName: tc.name, result: resultText, isError })

        const toolResultMsg: ToolResultMessage = {
          role: 'toolResult',
          toolCallId: tc.id,
          toolName: tc.name,
          content: [{ type: 'text', text: resultText }],
          isError,
          timestamp: Date.now(),
        }
        messages.push(toolResultMsg)
      }

      // TOOL_EXEC -> STREAMING (next iteration)
      transition('STREAMING')
    } else if (assistantMsg.stopReason === 'stop') {
      // STREAMING -> DONE
      transition('DONE')
    } else {
      // length, error, aborted — treat as error
      transition('ERROR')
      return makeError(`Unexpected stop reason: ${assistantMsg.stopReason}`)
    }
  }

  // Extract final text from the last assistant message
  const lastMsg = messages.findLast((m): m is AssistantMessage => m.role === 'assistant')
  const finalText = lastMsg?.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map((c) => c.text)
    .join('') ?? ''

  const result: AgentSuccess = { type: 'success', text: finalText, messages, steps: step }
  emit({ type: 'done', result })
  return result
}
