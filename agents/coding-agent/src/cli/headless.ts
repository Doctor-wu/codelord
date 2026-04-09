// ---------------------------------------------------------------------------
// Headless runner — single-shot agent execution without TUI
// ---------------------------------------------------------------------------

import type { Api, Model } from '@mariozechner/pi-ai'
import { AgentRuntime } from '@codelord/core'
import type { AgentEvent, LifecycleEvent, RunOutcome, ToolCallStats, RouteHitStats } from '@codelord/core'
import type { TraceRunV2 } from '@codelord/core'
import { estimateTokens, DEFAULT_CONTEXT_WINDOW } from '@codelord/core'
import type { ContextWindowConfig } from '@codelord/core'
import type { CodelordConfig } from '@codelord/config'
import { createToolKernel } from './tool-kernel.js'
import { buildSystemPrompt } from './system-prompt.js'
import { TraceRecorder } from '../trace-recorder.js'
import { TraceStore, workspaceSlug, workspaceId } from '../trace-store.js'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface HeadlessRunOptions {
  model: Model<Api>
  apiKey: string
  config: CodelordConfig
  /** The user prompt to execute */
  prompt: string
  /** Working directory (defaults to process.cwd()) */
  cwd?: string
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
  const { model, apiKey, config, prompt } = options
  const cwd = options.cwd ?? process.cwd()
  const startTime = Date.now()

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
  })

  const runtime = new AgentRuntime({
    model,
    systemPrompt,
    tools,
    toolHandlers,
    apiKey,
    maxSteps: config.maxSteps,
    reasoningLevel: config.reasoningLevel,
    contextWindow: contextWindowConfig,
    onEvent: (event: AgentEvent) => recorder.onAgentEvent(event),
    onLifecycleEvent: (event: LifecycleEvent) => recorder.onLifecycleEvent(event),
    onProviderStreamEvent: (event) => recorder.onProviderStreamEvent(event),
    router,
    safetyPolicy,
  })

  runtime.enqueueUserMessage(prompt)

  let outcome: RunOutcome
  try {
    outcome = await runtime.run()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    outcome = { type: 'error', error: msg }
  }

  const toolStats = runtime.toolStats.exportSnapshot()
  const trace = recorder.finalize(outcome, { toolStats })

  // Persist trace (best effort)
  try { new TraceStore().save(trace) } catch { /* best effort */ }

  // Extract final text
  const text = outcome.type === 'success' ? outcome.text : ''

  return {
    outcome,
    trace,
    toolStats,
    text,
    durationMs: Date.now() - startTime,
  }
}
