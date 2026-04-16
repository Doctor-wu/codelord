// ---------------------------------------------------------------------------
// TraceRecorderV2 — 3-layer event ledger recorder
// ---------------------------------------------------------------------------

import { createHash, randomUUID } from 'node:crypto'
import type {
  LifecycleEvent,
  RunOutcome,
  UsageAggregate,
  ProviderStreamTraceEvent,
  LifecycleTraceEvent,
  TraceRunV2,
  TraceStepV2,
  TraceEventEntry,
  TraceSegment,
  AgentLifecycleCallbacks,
} from '@codelord/core'
import { safePreview } from '@codelord/core'
import type { RedactionHit } from '@codelord/core'

export interface TraceRecorderOptions {
  sessionId: string
  cwd: string
  workspaceRoot: string
  workspaceSlug: string
  workspaceId: string
  provider: string
  model: string
  systemPrompt: string
  rawMode?: boolean
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
  private usageSummary = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    llmCalls: 0,
  }
  private interruptRequestedAt: number | null = null
  private interruptSource: 'sigint' | 'api' = 'sigint'
  private _nextEventId = 0
  private _globalSeq = 0
  private totalProviderStream = 0
  private totalLifecycleEvents = 0
  private segments: TraceSegment[] = []
  private currentSegmentStart: number | null = null
  private currentSegmentStepStart: number = 0

  private readonly rawMode: boolean

  // --- Per-turn accumulators for trajectory (always active, not gated by rawMode) ---
  private turnTextAccum = ''
  private turnThinkingAccum = ''
  private turnStopReason: string | null = null

  constructor(opts: TraceRecorderOptions) {
    this.runId = randomUUID()
    this.opts = opts
    this.rawMode = opts.rawMode ?? false
    this.systemPromptHash = createHash('sha256').update(opts.systemPrompt).digest('hex').slice(0, 16)
    this.startedAt = Date.now()
  }

  get traceRunId(): string {
    return this.runId
  }

  /** Call before each runtime.run() burst to mark segment start */
  beginSegment(): void {
    this.currentSegmentStart = Date.now()
    // Record the step count at segment start (steps are 1-based, so next step is steps.length + 1)
    this.currentSegmentStepStart = this.steps.length + 1
  }

  /** Call after each runtime.run() burst to close the segment */
  endSegment(outcome: RunOutcome, _opts?: { toolStats?: TraceRunV2['toolStats'] }): void {
    if (this.currentSegmentStart === null) return

    // If there's a dangling currentStep, flush it
    if (this.currentStep) {
      this.currentStep.endedAt = Date.now()
      this.steps.push(this.currentStep)
      this.currentStep = null
    }

    const lastStep = this.steps.length
    const firstStep = this.currentSegmentStepStart

    this.segments.push({
      segmentIndex: this.segments.length,
      startedAt: this.currentSegmentStart,
      endedAt: Date.now(),
      outcome: {
        type: outcome.type,
        ...(outcome.type === 'success' ? { text: outcome.text } : {}),
        ...(outcome.type === 'error' ? { error: outcome.error } : {}),
        ...(outcome.type === 'blocked' ? { reason: outcome.reason } : {}),
      },
      stepRange: [firstStep, Math.max(firstStep, lastStep)],
    })

    this.currentSegmentStart = null
  }

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
      textPreview: null,
      thinkingPreview: null,
      stopReason: null,
      reasoningIntent: null,
      reasoningWhy: null,
      argsPreview: null,
      resultPreview: null,
      isError: null,
    }

    if (this.currentStep) {
      this.currentStep.events.push(le)
    } else {
      this.runEvents.push(le)
    }
  }

  // --- Provider stream layer ---

  onProviderStreamEvent(event: ProviderStreamTraceEvent): void {
    // Always accumulate text/thinking for trajectory (regardless of rawMode)
    if (event.type === 'text_delta' && event.deltaPreview) {
      this.turnTextAccum += event.deltaPreview
    } else if (event.type === 'thinking_delta' && event.deltaPreview) {
      this.turnThinkingAccum += event.deltaPreview
    } else if (event.type === 'done' && event.stopReason) {
      this.turnStopReason = event.stopReason
    }

    if (!this.rawMode) {
      this.totalProviderStream++
      return
    }
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

    // Trajectory mode: skip intermediate events
    if (event.type === 'tool_call_created' || event.type === 'tool_call_updated') {
      return
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
      textPreview: null,
      thinkingPreview: null,
      stopReason: null,
      reasoningIntent: null,
      reasoningWhy: null,
      argsPreview: null,
      resultPreview: null,
      isError: null,
    }

    switch (event.type) {
      case 'user_turn':
        le.question = event.content.slice(0, 200)
        break
      case 'assistant_turn_start': {
        le.reasoningIntent = event.reasoning.intent
        le.reasoningWhy = event.reasoning.why
        // Reset per-turn accumulators
        this.turnTextAccum = ''
        this.turnThinkingAccum = ''
        this.turnStopReason = null
        break
      }
      case 'assistant_turn_end': {
        le.reasoningIntent = event.reasoning.intent
        le.reasoningWhy = event.reasoning.why
        // Flush accumulated text/thinking into trajectory fields (redacted + truncated)
        if (this.turnTextAccum) {
          const { text, hits } = safePreview(this.turnTextAccum, 500)
          le.textPreview = text
          this.mergeHits(hits)
        }
        if (this.turnThinkingAccum) {
          const { text, hits } = safePreview(this.turnThinkingAccum, 500)
          le.thinkingPreview = text
          this.mergeHits(hits)
        }
        le.stopReason = this.turnStopReason
        // Reset accumulators
        this.turnTextAccum = ''
        this.turnThinkingAccum = ''
        this.turnStopReason = null
        break
      }
      case 'tool_call_completed': {
        le.toolCallId = event.toolCall.id
        le.toolName = event.toolCall.toolName
        le.phase = event.toolCall.phase
        le.isError = event.toolCall.isError
        // Capture args preview (redacted)
        const argsStr = Object.keys(event.toolCall.args).length > 0 ? JSON.stringify(event.toolCall.args) : null
        if (argsStr) {
          const { text: ap, hits: ah } = safePreview(argsStr, 300)
          le.argsPreview = ap
          this.mergeHits(ah)
        }
        // Capture result preview (redacted)
        if (event.toolCall.result) {
          const { text: rp, hits: rh } = safePreview(event.toolCall.result, 300)
          le.resultPreview = rp
          this.mergeHits(rh)
        }
        break
      }
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
      case 'session_done':
        le.reason = event.success ? (event.text ?? 'success') : (event.error ?? 'error')
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
      case 'provider_error':
        le.reason = event.error
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
        lifecycleEvents: this.totalLifecycleEvents,
      },
      steps: this.steps,
      runEvents: this.runEvents,
      ...(opts?.toolStats ? { toolStats: opts.toolStats } : {}),
      ...(this.segments.length > 0 ? { segments: this.segments } : {}),
    }
  }

  // --- Internal ---

  buildLifecycleCallbacks(): AgentLifecycleCallbacks {
    return {
      // Trajectory recording is handled via onLifecycleEvent for now.
      // This provides the hook for Task 8's mergeLifecycleCallbacks wiring.
    }
  }

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
      textPreview: null,
      thinkingPreview: null,
      stopReason: null,
      reasoningIntent: null,
      reasoningWhy: null,
      argsPreview: null,
      resultPreview: null,
      isError: null,
    }

    if (this.currentStep) {
      this.currentStep.events.push(le)
    } else {
      this.runEvents.push(le)
    }
  }

  private mergeHits(hits: RedactionHit[]): void {
    for (const hit of hits) {
      const existing = this.allRedactionHits.find((h) => h.type === hit.type)
      if (existing) existing.count += hit.count
      else this.allRedactionHits.push({ ...hit })
    }
  }
}
