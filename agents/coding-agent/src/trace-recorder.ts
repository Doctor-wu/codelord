// ---------------------------------------------------------------------------
// TraceRecorder — consumes lifecycle events and builds a structured TraceRun
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto'
import { randomUUID } from 'node:crypto'
import type {
  LifecycleEvent, AgentEvent, RunOutcome, UsageAggregate,
} from '@agent/core'
import { safePreview } from '@agent/core'
import type { RedactionHit } from '@agent/core'
import type {
  TraceRun, TraceStep, TraceEvent,
} from '@agent/core'

export interface TraceRecorderOptions {
  sessionId: string
  cwd: string
  provider: string
  model: string
  systemPrompt: string
}

export class TraceRecorder {
  private readonly runId: string
  private readonly opts: TraceRecorderOptions
  private readonly systemPromptHash: string
  private readonly startedAt: number
  private steps: TraceStep[] = []
  private currentStep: TraceStep | null = null
  private allRedactionHits: RedactionHit[] = []
  private usageSummary = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }, llmCalls: 0 }
  private interruptRequestedAt: number | null = null

  constructor(opts: TraceRecorderOptions) {
    this.runId = randomUUID()
    this.opts = opts
    this.systemPromptHash = createHash('sha256').update(opts.systemPrompt).digest('hex').slice(0, 16)
    this.startedAt = Date.now()
  }

  /** Record a SIGINT request timestamp (called from REPL layer) */
  recordInterruptRequest(): void {
    this.interruptRequestedAt = Date.now()
  }

  /** Consume a lifecycle event */
  onLifecycleEvent(event: LifecycleEvent): void {
    switch (event.type) {
      case 'assistant_turn_start':
        this.currentStep = {
          step: this.steps.length + 1,
          startedAt: event.timestamp,
          endedAt: null,
          events: [],
        }
        break

      case 'assistant_turn_end':
        if (this.currentStep) {
          this.currentStep.endedAt = event.timestamp
        }
        break

      case 'usage_updated':
        this.recordLLMCall(event.usage, event.timestamp)
        break

      case 'tool_call_completed':
        this.recordToolExecution(event)
        break

      case 'queue_drained':
        for (const msg of event.messages) {
          const { text, hits } = safePreview(msg.content)
          this.mergeHits(hits)
          this.pushEvent({
            type: 'queue_message',
            contentPreview: text,
            enqueuedAt: msg.enqueuedAt,
            injectedAt: event.injectedAt,
            waitMs: event.injectedAt - msg.enqueuedAt,
          })
        }
        break

      case 'question_answered': {
        const { text: answerPreview, hits } = safePreview(event.answer)
        this.mergeHits(hits)
        this.pushEvent({
          type: 'ask_user',
          question: event.question,
          whyAsk: event.whyAsk,
          askedAt: event.askedAt,
          answeredAt: event.answeredAt,
          waitMs: event.answeredAt - event.askedAt,
          answerPreview,
        })
        break
      }

      case 'blocked_enter':
        if (event.reason === 'waiting_user' && event.question) {
          // Record ask_user without answer yet (may be answered later)
          this.pushEvent({
            type: 'ask_user',
            question: event.question,
            whyAsk: event.questionDetail?.whyAsk ?? '',
            askedAt: event.timestamp,
            answeredAt: null,
            waitMs: null,
            answerPreview: null,
          })
        }
        if (event.reason === 'interrupted') {
          this.pushEvent({
            type: 'user_interrupt',
            source: 'sigint',
            requestedAt: this.interruptRequestedAt ?? event.timestamp,
            observedAt: event.timestamp,
          })
          this.interruptRequestedAt = null
        }
        break
    }
  }

  /** Finalize the trace with the run outcome */
  finalize(outcome: RunOutcome): TraceRun {
    // Flush current step if still open
    if (this.currentStep) {
      this.currentStep.endedAt = Date.now()
      this.steps.push(this.currentStep)
      this.currentStep = null
    }

    return {
      runId: this.runId,
      sessionId: this.opts.sessionId,
      cwd: this.opts.cwd,
      provider: this.opts.provider,
      model: this.opts.model,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      outcome: {
        type: outcome.type,
        ...(outcome.type === 'success' ? { text: outcome.text } : {}),
        ...(outcome.type === 'error' ? { error: outcome.error } : {}),
        ...(outcome.type === 'blocked' ? { reason: outcome.reason } : {}),
      },
      systemPromptHash: this.systemPromptHash,
      usageSummary: this.usageSummary,
      redactionSummary: this.allRedactionHits,
      steps: this.steps,
    }
  }

  // --- Internal ---

  private pushEvent(event: TraceEvent): void {
    if (this.currentStep) {
      this.currentStep.events.push(event)
    } else {
      // Event outside a step — create an implicit step
      const step: TraceStep = {
        step: this.steps.length + 1,
        startedAt: Date.now(),
        endedAt: Date.now(),
        events: [event],
      }
      this.steps.push(step)
    }
  }

  private recordLLMCall(usage: UsageAggregate, timestamp: number): void {
    if (!usage.lastCall) return
    const lc = usage.lastCall
    this.pushEvent({
      type: 'llm_call',
      model: lc.model,
      provider: lc.provider,
      stopReason: lc.stopReason,
      latencyMs: lc.latencyMs,
      usage: {
        input: lc.input,
        output: lc.output,
        cacheRead: lc.cacheRead,
        cacheWrite: lc.cacheWrite,
        totalTokens: lc.totalTokens,
        cost: { ...lc.cost },
      },
      timestamp,
    })
    // Update run-level summary
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

  private recordToolExecution(event: Extract<LifecycleEvent, { type: 'tool_call_completed' }>): void {
    const tc = event.toolCall
    const { text: argsPreview, hits: argsHits } = safePreview(JSON.stringify(tc.args))
    const { text: resultPreview, hits: resultHits } = safePreview(tc.result ?? '')
    const { text: stdoutPreview, hits: stdoutHits } = safePreview(tc.stdout)
    const { text: stderrPreview, hits: stderrHits } = safePreview(tc.stderr)
    this.mergeHits([...argsHits, ...resultHits, ...stdoutHits, ...stderrHits])

    const durationMs = (tc.completedAt ?? Date.now()) - (tc.executionStartedAt ?? tc.createdAt)

    this.pushEvent({
      type: 'tool_execution',
      toolName: tc.toolName,
      phase: tc.phase,
      isError: tc.isError,
      durationMs,
      route: tc.route ? { wasRouted: tc.route.wasRouted, ruleId: tc.route.ruleId, originalToolName: tc.route.originalToolName } : null,
      safety: tc.safety ? { riskLevel: tc.safety.riskLevel, allowed: tc.safety.allowed, ruleId: tc.safety.ruleId } : null,
      argsPreview,
      resultPreview,
      stdoutPreview,
      stderrPreview,
      timestamp: tc.completedAt ?? Date.now(),
    })
  }

  private mergeHits(hits: RedactionHit[]): void {
    for (const hit of hits) {
      const existing = this.allRedactionHits.find(h => h.type === hit.type)
      if (existing) {
        existing.count += hit.count
      } else {
        this.allRedactionHits.push({ ...hit })
      }
    }
  }
}
