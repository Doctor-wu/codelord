import type {
  Api,
  Message,
  Model,
  SimpleStreamOptions,
  Tool,
} from '@mariozechner/pi-ai'
import { AgentRuntime } from './runtime.js'
import type { ToolRouter } from './tool-router.js'
import type { ToolSafetyPolicy } from './tool-safety.js'
import type { LifecycleEvent } from './events.js'
import type { AgentLifecycleCallbacks } from './lifecycle.js'

// ---------------------------------------------------------------------------
// Tool handler registry (kept here for backward compat exports)
// ---------------------------------------------------------------------------

export interface ToolExecutionContext {
  emitOutput: (stream: 'stdout' | 'stderr', chunk: string) => void
}

export interface ToolExecutionResult {
  output: string
  isError: boolean
  errorCode?: string
}

export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolExecutionContext,
) => Promise<ToolExecutionResult>

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
  onLifecycleEvent?: (event: LifecycleEvent) => void
  lifecycle?: AgentLifecycleCallbacks
  router?: ToolRouter
  safetyPolicy?: ToolSafetyPolicy
}

// ---------------------------------------------------------------------------
// runAgent — single-shot façade over AgentRuntime
// ---------------------------------------------------------------------------

export async function runAgent<TApi extends Api = Api>(
  options: RunAgentOptions<TApi>,
): Promise<AgentResult> {
  const {
    userMessage,
    model,
    systemPrompt,
    tools,
    toolHandlers,
    apiKey,
    maxSteps,
    streamOptions,
    onLifecycleEvent,
    lifecycle,
    router,
    safetyPolicy,
  } = options

  const runtime = new AgentRuntime({
    model,
    systemPrompt,
    tools,
    toolHandlers,
    apiKey,
    maxSteps,
    streamOptions,
    onLifecycleEvent,
    lifecycle,
    router,
    safetyPolicy,
  })

  // Inject the initial user message
  runtime.messages.push({
    role: 'user',
    content: userMessage,
    timestamp: Date.now(),
  })

  // Drive to terminal state
  const outcome = await runtime.run()

  if (outcome.type === 'success') {
    return {
      type: 'success',
      text: outcome.text,
      messages: runtime.messages,
      steps: runtime.burstStepCount,
    }
  }

  // Single-shot compat: if agent asked a question, surface it as a clear error
  if (outcome.type === 'blocked' && outcome.reason === 'waiting_user') {
    const q = runtime.pendingQuestion
    return {
      type: 'error',
      error: `Agent requires user input and cannot proceed in single-shot mode. Question: ${q?.question ?? '(unknown)'}. Reason: ${q?.whyAsk ?? '(unknown)'}`,
      messages: runtime.messages,
      steps: runtime.burstStepCount,
    }
  }

  return {
    type: 'error',
    error: outcome.type === 'error' ? outcome.error : 'Unexpected blocked state',
    messages: runtime.messages,
    steps: runtime.burstStepCount,
  }
}
