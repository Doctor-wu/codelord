// ---------------------------------------------------------------------------
// ToolStatsTracker — lightweight tool call success/failure counters
// ---------------------------------------------------------------------------

export interface ToolCallStats {
  attempts: number
  successes: number
  failures: number
  /** Per-error-code breakdown, e.g. { NO_MATCH: 3, MULTI_MATCH: 1 } */
  errorCodes: Record<string, number>
}

export interface RouteHitStats {
  /** How many times this ruleId fired */
  hits: number
  /** Of those, how many ended in tool success */
  successes: number
  /** Of those, how many ended in tool failure */
  failures: number
}

const ERROR_CODE_RE = /^ERROR \[([A-Z_]+)\]/

function extractErrorCode(resultText: string): string | undefined {
  return ERROR_CODE_RE.exec(resultText)?.[1]
}

export class ToolStatsTracker {
  private readonly _tools = new Map<string, ToolCallStats>()
  private readonly _routes = new Map<string, RouteHitStats>()

  recordToolCall(toolName: string, isError: boolean, resultText?: string): void {
    let stats = this._tools.get(toolName)
    if (!stats) {
      stats = { attempts: 0, successes: 0, failures: 0, errorCodes: {} }
      this._tools.set(toolName, stats)
    }
    stats.attempts++
    if (isError) {
      stats.failures++
      const code = resultText ? extractErrorCode(resultText) : undefined
      if (code) {
        stats.errorCodes[code] = (stats.errorCodes[code] ?? 0) + 1
      }
    } else {
      stats.successes++
    }
  }

  recordRouteHit(ruleId: string, isError: boolean): void {
    let stats = this._routes.get(ruleId)
    if (!stats) {
      stats = { hits: 0, successes: 0, failures: 0 }
      this._routes.set(ruleId, stats)
    }
    stats.hits++
    if (isError) stats.failures++
    else stats.successes++
  }

  getToolStats(toolName: string): ToolCallStats | undefined {
    return this._tools.get(toolName)
  }

  getAllToolStats(): ReadonlyMap<string, ToolCallStats> {
    return this._tools
  }

  getAllRouteStats(): ReadonlyMap<string, RouteHitStats> {
    return this._routes
  }

  exportSnapshot(): { tools: Record<string, ToolCallStats>; routes: Record<string, RouteHitStats> } {
    return {
      tools: Object.fromEntries(this._tools),
      routes: Object.fromEntries(this._routes),
    }
  }

  hydrateFromSnapshot(snapshot: { tools: Record<string, ToolCallStats>; routes: Record<string, RouteHitStats> }): void {
    this._tools.clear()
    for (const [k, v] of Object.entries(snapshot.tools)) {
      this._tools.set(k, { ...v, errorCodes: { ...v.errorCodes } })
    }
    this._routes.clear()
    for (const [k, v] of Object.entries(snapshot.routes)) {
      this._routes.set(k, { ...v })
    }
  }
}
