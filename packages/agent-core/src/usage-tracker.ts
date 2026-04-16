// ---------------------------------------------------------------------------
// UsageTracker — cumulative token/cost telemetry
// ---------------------------------------------------------------------------

import type { UsageAggregate, UsageCostBreakdown } from './events.js'
import { createUsageAggregate } from './events.js'

interface CallUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
  cost: UsageCostBreakdown
}

export class UsageTracker {
  private _aggregate: UsageAggregate = createUsageAggregate()

  get aggregate(): UsageAggregate {
    return this._aggregate
  }

  /**
   * Record usage from a completed LLM call.
   * Returns the updated aggregate (for lifecycle emission).
   */
  recordCall(usage: CallUsage, model: string, provider: string, stopReason: string, latencyMs: number): UsageAggregate {
    this._aggregate.input += usage.input
    this._aggregate.output += usage.output
    this._aggregate.cacheRead += usage.cacheRead
    this._aggregate.cacheWrite += usage.cacheWrite
    this._aggregate.totalTokens += usage.totalTokens
    this._aggregate.cost.input += usage.cost.input
    this._aggregate.cost.output += usage.cost.output
    this._aggregate.cost.cacheRead += usage.cost.cacheRead
    this._aggregate.cost.cacheWrite += usage.cost.cacheWrite
    this._aggregate.cost.total += usage.cost.total
    this._aggregate.llmCalls++
    this._aggregate.lastCall = {
      model,
      provider,
      stopReason,
      latencyMs,
      input: usage.input,
      output: usage.output,
      cacheRead: usage.cacheRead,
      cacheWrite: usage.cacheWrite,
      totalTokens: usage.totalTokens,
      cost: { ...usage.cost },
    }
    return this._aggregate
  }

  /** Deep-copy for snapshot export. */
  exportSnapshot(): UsageAggregate {
    return {
      ...this._aggregate,
      cost: { ...this._aggregate.cost },
      lastCall: this._aggregate.lastCall
        ? { ...this._aggregate.lastCall, cost: { ...this._aggregate.lastCall.cost } }
        : null,
    }
  }

  /** Restore from snapshot. */
  hydrateFromSnapshot(snapshot: UsageAggregate): void {
    this._aggregate = {
      ...snapshot,
      cost: { ...snapshot.cost },
      lastCall: snapshot.lastCall ? { ...snapshot.lastCall, cost: { ...snapshot.lastCall.cost } } : null,
    }
  }
}
