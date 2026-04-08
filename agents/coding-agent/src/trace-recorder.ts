// ---------------------------------------------------------------------------
// TraceRecorderV2 — 3-layer event ledger recorder
// ---------------------------------------------------------------------------

import { createHash, randomUUID } from 'node:crypto'
import type {
  LifecycleEvent, AgentEvent, RunOutcome, UsageAggregate,
  ProviderStreamTraceEvent, AgentTraceEvent, LifecycleTraceEvent,
  TraceRunV2, TraceStepV2, TraceEventEntry,
} from '@agent/core'
import { safePreview } from '@agent/core'
import type { RedactionHit } from '@agent/core'

export interface TraceRecorderOptions {
  sessionId: string
  cwd: string
  workspaceRoot: string
  workspaceSlug: string
  workspaceId: string
  provider: string
  model: string
  systemPrompt: string
}

export class TraceRecorder {
  private readonly runId: string
  private readonly opts: TraceRecorderOptions
  private readonly systemPromptHash: string
  private readonly startedAt: number
  private steps: TraceStepV2[] = []
  private currentStep: TraceStepV2 | null = null
  private runEvents: TraceEventEntry[] = []
  private allRedactionHits: RedactionHit[] = []
  private usageSummary = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }, llmCalls: 0 }
  private interruptRequestedAt: number | null = null
  private interruptSource: 'sigint' | 'api' = 'sigint'
  private _nextEventId = 0
  private _globalSeq = 0
  private totalProviderStream = 0
  private totalAgentEvents = 0
  private totalLifecycleEvents = 0
  private _toolcallStartTimestamps: number[] = []
  private _toolCallCreatedTimestamps: number[] = []

  constructor(opts: TraceRecorderOptions) {
    this.runId = randomUUID()
    this.opts = opts
    this.systemPromptHash = createHash('sha256').update(opts.systemPrompt).digest('hex').slice(0, 16)
    this.startedAt = Date.now()
  }

  get traceRunId(): string { return this.runId }

  recordInterruptRequest(source: 'sigint' | 'api' = 'sigint'): void {
    this.interruptRequestedAt = Date.now()
    this.interruptSource = source

    // Emit interrupt_requested as a first-class lifecycle trace event
    const le: LifecycleTraceEvent = {
      eventId: ++this._nextEventId,
      seq: ++this._globalSeq,
      type: 'interrupt_requested',
      timestamp: this.interruptRequestedAt,
      step: this.currentStep?.step ?? 0,
      turnId: this.currentStep?.turnId ?? null,
      source: 'lifecycle_event',
      toolCallId: null,
      toolName: null,
      phase: null,
      reason: null,
      question: null,
      usageSnapshot: null,
      count: null,
      messageCount: null,
      interruptSource: source,
      requestedAt: null,
      observedAt: null,
      latencyMs: null,
      droppedCount: null,
      droppedTokens: null,
      checkpointId: null,
      fileCount: null,
    }

    if (this.currentStep) {
      this.currentStep.events.push(le)
    } else {
      this.runEvents.push(le)
    }
  }

  // --- Provider stream layer ---

  onProviderStreamEvent(event: ProviderStreamTraceEvent): void {
    this.totalProviderStream++
    event = { ...event, seq: ++this._globalSeq }
    // Redact previews
    if (event.deltaPreview) {
      const { text, hits } = safePreview(event.deltaPreview, 300)
      event = { ...event, deltaPreview: text }
      this.mergeHits(hits)
    }
    if (event.contentPreview) {
      const { text, hits } = safePreview(event.contentPreview, 300)
      event = { ...event, contentPreview: text }
      this.mergeHits(hits)
    }
    this.ensureStep(event.step, event.turnId)
    this.currentStep!.events.push(event)
  }

  // --- Agent event layer ---

  onAgentEvent(event: AgentEvent): void {
    this.totalAgentEvents++
    const now = Date.now()
    const base: AgentTraceEvent = {
      eventId: ++this._nextEventId,
      seq: ++this._globalSeq,
      type: event.type,
      timestamp: now,
      step: 0,
      turnId: null,
      source: 'agent_event',
      contentIndex: null,
      toolCallId: null,
      toolName: null,
      deltaPreview: null,
      riskLevel: null,
      allowed: null,
      isError: null,
      resultPreview: null,
    }

    switch (event.type) {
      case 'step_start':
        base.step = event.step; break
      case 'thinking_start': case 'text_start':
        base.contentIndex = event.contentIndex; break
      case 'thinking_delta': case 'text_delta':
        base.contentIndex = event.contentIndex
        base.deltaPreview = safePreview(event.delta, 300).text; break
      case 'thinking_end': case 'text_end':
        base.contentIndex = event.contentIndex; break
      case 'toolcall_start': case 'toolcall_delta':
        base.contentIndex = event.contentIndex
        base.toolName = event.toolName; break
      case 'toolcall_end':
        base.contentIndex = event.contentIndex
        base.toolCallId = event.toolCall.id
        base.toolName = event.toolCall.name; break
      case 'tool_routed':
        base.toolName = event.resolvedToolName; break
      case 'tool_safety_checked':
        base.toolName = event.toolName
        base.riskLevel = event.riskLevel
        base.allowed = event.allowed; break
      case 'tool_exec_start':
        base.toolName = event.toolName; break
      case 'tool_output_delta':
        base.toolName = event.toolName
        base.deltaPreview = safePreview(event.chunk, 300).text; break
      case 'tool_result':
        base.toolName = event.toolName
        base.isError = event.isError
        base.resultPreview = safePreview(event.result, 300).text; break
      case 'error':
        base.resultPreview = event.error; break
    }

    if (this.currentStep) {
      base.step = this.currentStep.step
      base.turnId = this.currentStep.turnId
      this.currentStep.events.push(base)
    } else {
      this.runEvents.push(base)
    }
  }

  // --- Lifecycle event layer ---

  onLifecycleEvent(event: LifecycleEvent): void {
    this.totalLifecycleEvents++
    const now = Date.now()

    // Step management
    switch (event.type) {
      case 'assistant_turn_start':
        this.currentStep = {
          step: this.steps.length + 1,
          turnId: event.id,
          startedAt: event.timestamp,
          endedAt: null,
          events: [],
        }
        break
      case 'assistant_turn_end':
        if (this.currentStep) this.currentStep.endedAt = event.timestamp
        break
    }

    // Pre-emit: interrupt_observed must come before blocked_enter in seq order
    if (event.type === 'blocked_enter' && (event as any).reason === 'interrupted') {
      this.emitInterruptObserved()
    }

    // Build lifecycle trace event
    const le: LifecycleTraceEvent = {
      eventId: ++this._nextEventId,
      seq: ++this._globalSeq,
      type: event.type,
      timestamp: 'timestamp' in event ? (event as { timestamp: number }).timestamp : now,
      step: this.currentStep?.step ?? 0,
      turnId: this.currentStep?.turnId ?? null,
      source: 'lifecycle_event',
      toolCallId: null,
      toolName: null,
      phase: null,
      reason: null,
      question: null,
      usageSnapshot: null,
      count: null,
      messageCount: null,
      interruptSource: null,
      requestedAt: null,
      observedAt: null,
      latencyMs: null,
      droppedCount: null,
      droppedTokens: null,
      checkpointId: null,
      fileCount: null,
    }

    switch (event.type) {
      case 'user_turn':
        le.question = event.content.slice(0, 200)
        break
      case 'tool_call_created': case 'tool_call_updated': case 'tool_call_completed':
        le.toolCallId = event.toolCall.id
        le.toolName = event.toolCall.toolName
        le.phase = event.toolCall.phase
        if (event.type === 'tool_call_created') {
          this._toolCallCreatedTimestamps.push(event.toolCall.createdAt)
        }
        break
      case 'usage_updated':
        this.recordUsage(event.usage)
        if (event.usage.lastCall) {
          le.usageSnapshot = {
            input: event.usage.lastCall.input,
            output: event.usage.lastCall.output,
            cacheRead: event.usage.lastCall.cacheRead,
            cacheWrite: event.usage.lastCall.cacheWrite,
            totalTokens: event.usage.lastCall.totalTokens,
            cost: { ...event.usage.lastCall.cost },
          }
        }
        break
      case 'blocked_enter':
        le.reason = event.reason
        if (event.question) le.question = event.question
        break
      case 'queue_drained':
        le.count = event.count
        le.messageCount = event.messages.length
        for (const msg of event.messages) {
          const { hits } = safePreview(msg.content)
          this.mergeHits(hits)
        }
        break
      case 'tool_call_streaming_start':
        le.toolName = event.toolName
        this._toolcallStartTimestamps.push(event.timestamp)
        break
      case 'tool_call_streaming_delta':
        le.toolName = event.toolName
        break
      case 'tool_call_streaming_end':
        le.toolCallId = event.toolCallId
        le.toolName = event.toolName
        break
      case 'queue_enqueued':
        le.question = event.content.slice(0, 200)
        break
      case 'question_answered':
        le.question = event.question
        const { hits } = safePreview(event.answer)
        this.mergeHits(hits)
        break
      case 'interrupt_requested':
        le.interruptSource = event.source
        break
      case 'interrupt_observed':
        le.interruptSource = event.source
        le.requestedAt = event.requestedAt
        le.observedAt = event.observedAt
        le.latencyMs = event.latencyMs
        break
      case 'context_truncated':
        le.droppedCount = event.droppedCount
        le.droppedTokens = event.droppedTokens
        break
      case 'checkpoint_created':
        le.checkpointId = event.checkpointId
        le.fileCount = event.fileCount
        break
      case 'checkpoint_undone':
        le.checkpointId = event.checkpointId
        le.fileCount = event.restoredFileCount
        break
    }

    if (this.currentStep) {
      this.currentStep.events.push(le)
    } else {
      // No active step — this is a run-level event (session_done, queue_drained, etc.)
      this.runEvents.push(le)
    }

    // Flush step on turn end
    if (event.type === 'assistant_turn_end' && this.currentStep) {
      this.steps.push(this.currentStep)
      this.currentStep = null
    }
  }

  // --- Finalize ---

  finalize(outcome: RunOutcome, opts?: { toolStats?: TraceRunV2['toolStats'] }): TraceRunV2 {
    if (this.currentStep) {
      this.currentStep.endedAt = Date.now()
      this.steps.push(this.currentStep)
      this.currentStep = null
    }

    let toolVisibility: TraceRunV2['toolVisibility']
    const pairCount = Math.min(this._toolcallStartTimestamps.length, this._toolCallCreatedTimestamps.length)
    if (pairCount > 0) {
      const gaps: number[] = []
      let provisionalHits = 0
      for (let i = 0; i < pairCount; i++) {
        const gap = this._toolCallCreatedTimestamps[i]! - this._toolcallStartTimestamps[i]!
        gaps.push(Math.max(0, gap))
        if (gap > 0) provisionalHits++
      }
      const sum = gaps.reduce((a, b) => a + b, 0)
      toolVisibility = {
        avgProviderToLifecycleMs: Math.round(sum / gaps.length),
        maxProviderToLifecycleMs: Math.max(...gaps),
        measuredCount: pairCount,
        provisionalHitCount: provisionalHits,
      }
    }

    return {
      version: 2,
      runId: this.runId,
      sessionId: this.opts.sessionId,
      workspaceRoot: this.opts.workspaceRoot,
      workspaceSlug: this.opts.workspaceSlug,
      workspaceId: this.opts.workspaceId,
      cwd: this.opts.cwd,
      provider: this.opts.provider,
      model: this.opts.model,
      systemPromptHash: this.systemPromptHash,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      outcome: {
        type: outcome.type,
        ...(outcome.type === 'success' ? { text: outcome.text } : {}),
        ...(outcome.type === 'error' ? { error: outcome.error } : {}),
        ...(outcome.type === 'blocked' ? { reason: outcome.reason } : {}),
      },
      usageSummary: this.usageSummary,
      redactionSummary: this.allRedactionHits,
      eventCounts: {
        providerStream: this.totalProviderStream,
        agentEvents: this.totalAgentEvents,
        lifecycleEvents: this.totalLifecycleEvents,
      },
      steps: this.steps,
      runEvents: this.runEvents,
      ...(opts?.toolStats ? { toolStats: opts.toolStats } : {}),
      ...(toolVisibility ? { toolVisibility } : {}),
    }
  }

  // --- Internal ---

  private ensureStep(step: number, turnId: string | null): void {
    if (!this.currentStep || this.currentStep.step !== step) {
      if (this.currentStep) {
        this.currentStep.endedAt = Date.now()
        this.steps.push(this.currentStep)
      }
      this.currentStep = {
        step,
        turnId,
        startedAt: Date.now(),
        endedAt: null,
        events: [],
      }
    }
  }

  private recordUsage(usage: UsageAggregate): void {
    if (!usage.lastCall) return
    const lc = usage.lastCall
    this.usageSummary.input += lc.input
    this.usageSummary.output += lc.output
    this.usageSummary.cacheRead += lc.cacheRead
    this.usageSummary.cacheWrite += lc.cacheWrite
    this.usageSummary.totalTokens += lc.totalTokens
    this.usageSummary.cost.input += lc.cost.input
    this.usageSummary.cost.output += lc.cost.output
    this.usageSummary.cost.cacheRead += lc.cost.cacheRead
    this.usageSummary.cost.cacheWrite += lc.cost.cacheWrite
    this.usageSummary.cost.total += lc.cost.total
    this.usageSummary.llmCalls++
  }

  private emitInterruptObserved(): void {
    const now = Date.now()
    const le: LifecycleTraceEvent = {
      eventId: ++this._nextEventId,
      seq: ++this._globalSeq,
      type: 'interrupt_observed',
      timestamp: now,
      step: this.currentStep?.step ?? 0,
      turnId: this.currentStep?.turnId ?? null,
      source: 'lifecycle_event',
      toolCallId: null,
      toolName: null,
      phase: null,
      reason: null,
      question: null,
      usageSnapshot: null,
      count: null,
      messageCount: null,
      interruptSource: this.interruptSource,
      requestedAt: this.interruptRequestedAt,
      observedAt: now,
      latencyMs: this.interruptRequestedAt ? now - this.interruptRequestedAt : null,
      droppedCount: null,
      droppedTokens: null,
      checkpointId: null,
      fileCount: null,
    }

    if (this.currentStep) {
      this.currentStep.events.push(le)
    } else {
      this.runEvents.push(le)
    }
  }

  private mergeHits(hits: RedactionHit[]): void {
    for (const hit of hits) {
      const existing = this.allRedactionHits.find(h => h.type === hit.type)
      if (existing) existing.count += hit.count
      else this.allRedactionHits.push({ ...hit })
    }
  }
}
