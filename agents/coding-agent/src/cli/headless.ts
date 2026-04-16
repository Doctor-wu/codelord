// ---------------------------------------------------------------------------
// Headless runner — single-shot agent execution without TUI
// ---------------------------------------------------------------------------

import type { Api, Model } from '@mariozechner/pi-ai'
import { AgentRuntime } from '@codelord/core'
import type { LifecycleEvent, RunOutcome, ToolCallStats, RouteHitStats, AgentLifecycleCallbacks } from '@codelord/core'
import type { TraceRunV2 } from '@codelord/core'
import { estimateTokens, DEFAULT_CONTEXT_WINDOW } from '@codelord/core'
import type { ContextWindowConfig } from '@codelord/core'
import { resolveCodelordHome, workspaceDir as workspaceDirOf, workspaceSlug, workspaceId } from '@codelord/config'
import type { CodelordConfig } from '@codelord/config'
import { createToolKernel } from './tool-kernel.js'
import { buildSystemPrompt } from './system-prompt.js'
import { TraceRecorder } from '../trace-recorder.js'
import { TraceStore } from '../trace-store.js'
import { withProviderAuthEnv } from '../auth/provider-env.js'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type HeadlessProgressEvent =
  | { type: 'turn_start' }
  | { type: 'tool_call'; toolName: string; phase: 'started' | 'completed'; isError?: boolean }
  | { type: 'text_delta'; text: string }
  | { type: 'thinking'; preview: string }
  | { type: 'done'; outcome: string; durationMs: number; totalTokens: number; cost: number }

export interface HeadlessRunOptions {
  model: Model<Api>
  apiKey: string
  config: CodelordConfig
  /** The user prompt to execute */
  prompt: string
  /** Working directory (defaults to process.cwd()) */
  cwd?: string
  /** Optional callback for streaming progress events */
  onProgress?: (event: HeadlessProgressEvent) => void
  /** Enable streaming progress events (text_delta, thinking). Default: false (terminal events only) */
  streaming?: boolean
  /** Include raw provider stream events in trace. Default: false */
  rawTrace?: boolean
}

export interface HeadlessRunResult {
  outcome: RunOutcome
  trace: TraceRunV2
  toolStats: { tools: Record<string, ToolCallStats>; routes: Record<string, RouteHitStats> }
  /** Final assistant text (empty string if no text output) */
  text: string
  /** Total duration in ms */
  durationMs: number
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runHeadless(options: HeadlessRunOptions): Promise<HeadlessRunResult> {
  const { model, apiKey, config, prompt, onProgress, streaming = false } = options
  const cwd = options.cwd ?? process.cwd()
  const startTime = Date.now()
  const codelordHome = resolveCodelordHome()
  const wsDir = workspaceDirOf(codelordHome, cwd)

  const { tools, toolHandlers, contracts, router, safetyPolicy } = createToolKernel({ cwd, config })
  const systemPrompt = buildSystemPrompt({ cwd, contracts })

  // Context window config
  const contextWindowConfig: ContextWindowConfig = {
    maxTokens: config.contextWindow?.maxTokens ?? DEFAULT_CONTEXT_WINDOW.maxTokens,
    reservedOutputTokens: config.contextWindow?.reservedOutputTokens ?? DEFAULT_CONTEXT_WINDOW.reservedOutputTokens,
  }

  // Trace infrastructure
  const wsSlug = workspaceSlug(cwd)
  const wsId = workspaceId(cwd)
  const recorder = new TraceRecorder({
    sessionId: `headless-${Date.now()}`,
    cwd,
    workspaceRoot: cwd,
    workspaceSlug: wsSlug,
    workspaceId: wsId,
    provider: config.provider,
    model: config.model,
    systemPrompt,
    rawMode: options.rawTrace,
  })

  // Progress events via lifecycle callbacks
  const lifecycleCallbacks: AgentLifecycleCallbacks = {
    onStart: () => {
      onProgress?.({ type: 'turn_start' })
    },
    onText: (event) => {
      if (streaming) {
        event.pipeable.subscribe((delta) => {
          onProgress?.({ type: 'text_delta', text: delta })
        })
      }
    },
    onThinking: (event) => {
      if (streaming) {
        event.pipeable.subscribe((delta) => {
          onProgress?.({ type: 'thinking', preview: delta })
        })
      }
    },
    onToolCall: (event) => {
      onProgress?.({ type: 'tool_call', toolName: event.toolName, phase: 'started' })
      event.pipeable
        .done()
        .then((lifecycle) => {
          onProgress?.({ type: 'tool_call', toolName: event.toolName, phase: 'completed', isError: lifecycle.isError })
        })
        .catch(() => {}) // ignore abort errors
    },
  }

  const runtime = new AgentRuntime({
    model,
    systemPrompt,
    tools,
    toolHandlers,
    apiKey,
    maxSteps: config.maxSteps,
    reasoningLevel: config.reasoningLevel,
    contextWindow: contextWindowConfig,
    lifecycle: lifecycleCallbacks,
    onLifecycleEvent: (event: LifecycleEvent) => {
      recorder.onLifecycleEvent(event)
    },
    onProviderStreamEvent: (event) => recorder.onProviderStreamEvent(event),
    router,
    safetyPolicy,
  })

  runtime.enqueueUserMessage(prompt)

  let outcome: RunOutcome
  try {
    outcome = await withProviderAuthEnv(config, apiKey, () => runtime.run())
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    outcome = { type: 'error', error: msg }
  }

  const toolStats = runtime.toolStats.exportSnapshot()
  const trace = recorder.finalize(outcome, { toolStats })

  // Persist trace (best effort)
  try {
    new TraceStore({ workspaceDir: wsDir }).save(trace)
  } catch {
    /* best effort */
  }

  // Extract final text
  const text = outcome.type === 'success' ? outcome.text : ''

  // Emit done event
  if (onProgress) {
    onProgress({
      type: 'done',
      outcome: outcome.type,
      durationMs: Date.now() - startTime,
      totalTokens: trace.usageSummary.totalTokens,
      cost: trace.usageSummary.cost.total,
    })
  }

  return {
    outcome,
    trace,
    toolStats,
    text,
    durationMs: Date.now() - startTime,
  }
}
