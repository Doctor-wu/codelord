// ---------------------------------------------------------------------------
// TraceStore — workspace-aware trace persistence
// ---------------------------------------------------------------------------
//
// Layout:
//   ~/.codelord/traces/<workspaceSlug>-<workspaceId>/<runId>.json
// ---------------------------------------------------------------------------

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import type { TraceRunV2, TraceEventEntry, ProviderStreamTraceEvent, LifecycleTraceEvent } from '@codelord/core'
import { normalizeTrace } from '@codelord/core'

const TRACES_DIR = join(homedir(), '.codelord', 'traces')

// ---------------------------------------------------------------------------
// Workspace utilities
// ---------------------------------------------------------------------------

export function workspaceSlug(cwd: string): string {
  return basename(cwd)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 40)
}

export function workspaceId(cwd: string): string {
  return createHash('sha256').update(cwd).digest('hex').slice(0, 12)
}

export function workspaceDirName(cwd: string): string {
  return `${workspaceSlug(cwd)}-${workspaceId(cwd)}`
}

// ---------------------------------------------------------------------------
// Trace summary for list display
// ---------------------------------------------------------------------------

export interface TraceSummary {
  runId: string
  sessionId: string
  workspaceSlug: string
  workspaceId: string
  cwd: string
  provider: string
  model: string
  startedAt: number
  endedAt: number
  outcome: string
  stepCount: number
  llmCalls: number
  totalTokens: number
  totalCost: number
  promptPreview: string
  segmentCount?: number
}

// ---------------------------------------------------------------------------
// Prefix match result
// ---------------------------------------------------------------------------

export interface PrefixCandidate {
  runId: string
  workspaceSlug: string
  workspaceId: string
  startedAt: number
  outcome: string
}

export type PrefixMatchResult =
  | { type: 'exact'; trace: TraceRunV2 }
  | { type: 'unique'; trace: TraceRunV2 }
  | { type: 'ambiguous'; candidates: PrefixCandidate[] }
  | { type: 'not_found' }

// ---------------------------------------------------------------------------
// TraceStore
// ---------------------------------------------------------------------------

export class TraceStore {
  private readonly baseDir: string

  constructor(baseDir = TRACES_DIR) {
    this.baseDir = baseDir
  }

  save(trace: TraceRunV2): void {
    const dir = join(this.baseDir, `${trace.workspaceSlug}-${trace.workspaceId}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${trace.runId}.json`), JSON.stringify(trace, null, 2), 'utf-8')
  }

  load(runId: string): TraceRunV2 | null {
    const result = this.findByPrefix(runId)
    if (result.type === 'exact' || result.type === 'unique') return result.trace
    return null
  }

  findByPrefix(prefix: string): PrefixMatchResult {
    if (!existsSync(this.baseDir)) return { type: 'not_found' }
    const candidates: { file: string; wsPath: string; runId: string; wsSlug: string; wsId: string }[] = []
    try {
      const wsDirs = readdirSync(this.baseDir, { withFileTypes: true })
      for (const ws of wsDirs) {
        if (!ws.isDirectory()) continue
        const wsPath = join(this.baseDir, ws.name)
        // Extract workspace slug/id from dir name
        const dashIdx = ws.name.lastIndexOf('-')
        const wsSlug = dashIdx > 0 ? ws.name.slice(0, dashIdx) : ws.name
        const wsId = dashIdx > 0 ? ws.name.slice(dashIdx + 1) : ''

        const files = readdirSync(wsPath).filter((f) => f.endsWith('.json'))
        for (const f of files) {
          const fRunId = f.slice(0, -5) // strip .json
          if (fRunId === prefix) {
            // Exact match — return immediately
            const trace = JSON.parse(readFileSync(join(wsPath, f), 'utf-8')) as TraceRunV2
            return { type: 'exact', trace }
          }
          if (prefix.length >= 4 && fRunId.startsWith(prefix)) {
            candidates.push({ file: f, wsPath, runId: fRunId, wsSlug, wsId })
          }
        }
      }
    } catch {
      return { type: 'not_found' }
    }

    if (candidates.length === 0) return { type: 'not_found' }
    if (candidates.length === 1) {
      const c = candidates[0]
      const trace = JSON.parse(readFileSync(join(c.wsPath, c.file), 'utf-8')) as TraceRunV2
      return { type: 'unique', trace }
    }
    // Ambiguous — return lightweight candidates
    const ambiguous: PrefixCandidate[] = candidates.map((c) => {
      try {
        const trace = JSON.parse(readFileSync(join(c.wsPath, c.file), 'utf-8')) as TraceRunV2
        return {
          runId: c.runId,
          workspaceSlug: c.wsSlug,
          workspaceId: c.wsId,
          startedAt: trace.startedAt,
          outcome: trace.outcome.type,
        }
      } catch {
        return { runId: c.runId, workspaceSlug: c.wsSlug, workspaceId: c.wsId, startedAt: 0, outcome: 'unknown' }
      }
    })
    return { type: 'ambiguous', candidates: ambiguous }
  }

  list(opts?: { workspaceId?: string; limit?: number }): TraceSummary[] {
    if (!existsSync(this.baseDir)) return []
    const limit = opts?.limit ?? 20
    const filterWsId = opts?.workspaceId

    const summaries: TraceSummary[] = []
    try {
      const wsDirs = readdirSync(this.baseDir, { withFileTypes: true })
      for (const ws of wsDirs) {
        if (!ws.isDirectory()) continue
        // If filtering by workspace, check the dir name suffix
        if (filterWsId && !ws.name.endsWith(`-${filterWsId}`)) continue

        const wsPath = join(this.baseDir, ws.name)
        const files = readdirSync(wsPath).filter((f) => f.endsWith('.json'))
        for (const file of files) {
          try {
            const trace = JSON.parse(readFileSync(join(wsPath, file), 'utf-8')) as TraceRunV2
            summaries.push({
              runId: trace.runId,
              sessionId: trace.sessionId,
              workspaceSlug: trace.workspaceSlug ?? '',
              workspaceId: trace.workspaceId ?? '',
              cwd: trace.cwd,
              provider: trace.provider,
              model: trace.model,
              startedAt: trace.startedAt,
              endedAt: trace.endedAt,
              outcome: trace.outcome.type,
              stepCount: trace.steps.length,
              llmCalls: trace.usageSummary.llmCalls,
              totalTokens: trace.usageSummary.totalTokens,
              totalCost: trace.usageSummary.cost.total,
              promptPreview: extractPromptPreview(trace),
              segmentCount: trace.segments?.length,
            })
          } catch {
            /* skip corrupt files */
          }
        }
      }
    } catch {
      /* best effort */
    }

    // Sort by startedAt descending, then limit
    summaries.sort((a, b) => b.startedAt - a.startedAt)
    return summaries.slice(0, limit)
  }
}

function extractPromptPreview(trace: TraceRunV2): string {
  for (const step of trace.steps) {
    for (const e of step.events) {
      if (e.source === 'lifecycle_event' && e.type === 'user_turn' && (e as LifecycleTraceEvent).question) {
        const text = (e as LifecycleTraceEvent).question!
        return text.length > 20 ? text.slice(0, 20) + '…' : text
      }
    }
  }
  return ''
}

// ---------------------------------------------------------------------------
// Trace formatting for CLI
// ---------------------------------------------------------------------------

export function formatTraceList(summaries: TraceSummary[]): string {
  if (summaries.length === 0) return 'No traces found.'
  const lines: string[] = ['Traces (most recent first):', '']
  for (const s of summaries) {
    const time = new Date(s.startedAt).toLocaleString()
    const dur = Math.round((s.endedAt - s.startedAt) / 1000)
    const cost = s.totalCost > 0 ? `$${s.totalCost.toFixed(4)}` : '$0'
    const prompt = s.promptPreview ? `  "${s.promptPreview}"` : ''
    const seg = s.segmentCount && s.segmentCount > 1 ? `  ${s.segmentCount}seg` : ''
    lines.push(
      `  ${s.runId.slice(0, 8)}  ${time}  ${s.outcome.padEnd(7)}  ${s.stepCount}steps  ${s.llmCalls}llm  ${s.totalTokens}tok  ${cost}  ${dur}s${seg}${prompt}`,
    )
    lines.push(`    ${s.cwd}  ${s.provider}/${s.model}`)
    lines.push('')
  }
  return lines.join('\n')
}

export type TraceShowMode = 'summary' | 'detail' | 'raw'

export function formatTraceShow(rawTrace: TraceRunV2, mode: TraceShowMode = 'summary'): string {
  const trace = normalizeTrace(rawTrace)
  const L: string[] = []

  // --- Header (shared across all modes) ---
  L.push(`Run: ${trace.runId}`)
  L.push(`Session: ${trace.sessionId}`)
  L.push(`Workspace: ${trace.workspaceSlug} (${trace.workspaceId})`)
  L.push(`CWD: ${trace.cwd}`)
  L.push(`Provider: ${trace.provider}  Model: ${trace.model}`)
  L.push(`System prompt: ${trace.systemPromptHash}`)
  L.push(
    `Time: ${new Date(trace.startedAt).toLocaleString()} → ${new Date(trace.endedAt).toLocaleString()} (${Math.round((trace.endedAt - trace.startedAt) / 1000)}s)`,
  )
  L.push(
    `Outcome: ${trace.outcome.type}${trace.outcome.error ? ` — ${trace.outcome.error}` : ''}${trace.outcome.reason ? ` — ${trace.outcome.reason}` : ''}`,
  )
  L.push(
    `Usage: ${trace.usageSummary.totalTokens} tok  ${trace.usageSummary.llmCalls} LLM calls  $${trace.usageSummary.cost.total.toFixed(4)}`,
  )
  L.push(
    `  input: ${trace.usageSummary.input}  output: ${trace.usageSummary.output}  cacheRead: ${trace.usageSummary.cacheRead}  cacheWrite: ${trace.usageSummary.cacheWrite}`,
  )
  L.push(`Events: ${trace.eventCounts.providerStream} provider  ${trace.eventCounts.lifecycleEvents} lifecycle`)
  if (trace.redactionSummary.length > 0) {
    L.push(`Redactions: ${trace.redactionSummary.map((r) => `${r.type}×${r.count}`).join(', ')}`)
  }
  L.push('')

  // --- Body (mode-specific) ---
  switch (mode) {
    case 'summary':
      formatSummaryBody(trace, L)
      break
    case 'detail':
      formatDetailBody(trace, L)
      break
    case 'raw':
      formatRawBody(trace, L)
      break
  }

  return L.join('\n')
}

// ---------------------------------------------------------------------------
// Summary mode — chronological trajectory narrative
// ---------------------------------------------------------------------------

function formatSummaryBody(trace: TraceRunV2, L: string[]): void {
  // Build a unified timeline: merge run-level events and step events by seq,
  // inserting step headers at the right chronological position.
  const allLifecycle: { event: LifecycleTraceEvent; stepEvents?: TraceEventEntry[] }[] = []

  // Collect run-level lifecycle events
  for (const e of trace.runEvents ?? []) {
    if (e.source === 'lifecycle_event') {
      allLifecycle.push({ event: e as LifecycleTraceEvent })
    }
  }

  // Collect step lifecycle events, injecting a synthetic "step_header" marker
  for (const step of trace.steps) {
    const sorted = [...step.events].toSorted((a, b) => a.seq - b.seq)

    // Create a synthetic header event at the step's start seq (use first event's seq - 0.5, or step.startedAt for timestamp sort)
    const firstSeq = sorted.length > 0 ? sorted[0].seq : 0
    const dur = step.endedAt ? `${((step.endedAt - step.startedAt) / 1000).toFixed(1)}s` : 'in-flight'

    // Segment separator
    let segHeader: string | null = null
    if (trace.segments && trace.segments.length > 1) {
      const seg = trace.segments.find((s) => step.step >= s.stepRange[0] && step.step <= s.stepRange[1])
      if (seg && step.step === seg.stepRange[0]) {
        segHeader = `── Segment ${seg.segmentIndex} (${seg.outcome.type})  ${new Date(seg.startedAt).toLocaleTimeString()} ──`
      }
    }

    // Inject step header as a synthetic lifecycle event (using a special type marker)
    allLifecycle.push({
      event: {
        eventId: -1,
        seq: firstSeq - 0.5,
        type: '__step_header__',
        timestamp: step.startedAt,
        step: step.step,
        turnId: null,
        source: 'lifecycle_event',
        toolCallId: null,
        toolName: null,
        phase: null,
        reason: segHeader, // piggyback segment header
        question: `══ Step ${step.step}  ${new Date(step.startedAt).toLocaleTimeString()}  ${dur} ══`,
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
      } as LifecycleTraceEvent,
    })

    for (const e of sorted) {
      if (e.source === 'lifecycle_event') {
        allLifecycle.push({ event: e as LifecycleTraceEvent, stepEvents: sorted })
      }
    }
  }

  // Sort everything by seq (run-level events have seq too)
  allLifecycle.sort((a, b) => a.event.seq - b.event.seq)

  // Emit unified timeline
  for (const { event, stepEvents } of allLifecycle) {
    if (event.type === '__step_header__') {
      if (event.reason) L.push(event.reason) // segment header
      L.push(event.question!)
      continue
    }
    formatTrajectoryEvent(event, L, stepEvents)
  }

  if (allLifecycle.length > 0) L.push('')
}

/** Format a single lifecycle trace event as a trajectory line. Used for both step-level and run-level events. */
function formatTrajectoryEvent(le: LifecycleTraceEvent, L: string[], siblingEvents?: TraceEventEntry[]): void {
  switch (le.type) {
    case 'user_turn':
      L.push(`  [user] ${le.question ? truncLine(le.question, 200) : '(empty)'}`)
      break

    case 'assistant_turn_start':
      if (le.reasoningIntent) {
        L.push(`  [intent] ${le.reasoningIntent}`)
      }
      break

    case 'tool_call_completed': {
      const name = le.toolName ?? 'unknown'
      const err = le.isError ? ' ERROR' : ''
      const argsLine = le.argsPreview ? truncLine(le.argsPreview, 120) : ''
      L.push(`  [tool] ${name}${err}${argsLine ? '  ' + argsLine : ''}`)
      if (le.resultPreview) {
        L.push(`      -> ${truncLine(le.resultPreview, 120)}`)
      }
      break
    }

    case 'assistant_turn_end': {
      if (le.thinkingPreview) {
        L.push(`  [thinking] ${truncLine(le.thinkingPreview, 200)}`)
      }
      if (le.textPreview) {
        L.push(`  [text] ${truncLine(le.textPreview, 200)}`)
      }
      if (le.stopReason) {
        L.push(`  [stop] ${le.stopReason}`)
      }
      // Usage summary for this turn (look in sibling events if available)
      if (siblingEvents) {
        const usageEvt = siblingEvents.find((x) => x.source === 'lifecycle_event' && x.type === 'usage_updated') as
          | LifecycleTraceEvent
          | undefined
        if (usageEvt?.usageSnapshot) {
          const u = usageEvt.usageSnapshot
          L.push(`  [usage] ${fmtNum(u.input)} in / ${fmtNum(u.output)} out  $${u.cost.total.toFixed(4)}`)
        }
      }
      break
    }

    case 'interrupt_requested':
      L.push(`  [interrupt] ${le.interruptSource ?? 'unknown'}`)
      break

    case 'context_truncated':
      L.push(`  [truncated] dropped ${le.droppedCount} messages (${fmtNum(le.droppedTokens ?? 0)} tokens)`)
      break

    case 'checkpoint_created':
      L.push(`  [checkpoint] ${le.checkpointId?.slice(0, 8) ?? '?'} (${le.fileCount ?? 0} files)`)
      break

    case 'provider_error':
      L.push(`  [error] ${le.reason ?? 'unknown provider error'}`)
      break

    case 'session_done':
      L.push(`  [done] ${le.reason ? truncLine(le.reason, 120) : 'ok'}`)
      break

    case 'question_answered':
      L.push(`  [answered] ${le.question ? truncLine(le.question, 80) : '?'}`)
      break

    // Plumbing — skip in trajectory (user_turn already captures input; usage shown inline with turn_end)
    case 'queue_enqueued':
    case 'queue_drained':
    case 'blocked_enter':
    case 'blocked_exit':
    case 'usage_updated':
    case 'interrupt_observed':
      break

    default:
      // Catch-all for unknown event types
      L.push(`  [${le.type}]${le.reason ? ' ' + le.reason : ''}${le.question ? ' ' + truncLine(le.question, 80) : ''}`)
      break
  }
}

function truncLine(text: string, max: number): string {
  // Collapse newlines to spaces for single-line display
  const flat = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
  return flat.length > max ? flat.slice(0, max) + '…' : flat
}

function fmtNum(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`
}

// ---------------------------------------------------------------------------
// Detail mode — merged P+A pairs, lifecycle shown separately
// ---------------------------------------------------------------------------

function formatDetailBody(trace: TraceRunV2, L: string[]): void {
  for (const step of trace.steps) {
    const dur = step.endedAt ? `${step.endedAt - step.startedAt}ms` : 'in-flight'
    const sorted = [...step.events].toSorted((a, b) => a.seq - b.seq)
    const pCount = sorted.filter((e) => e.source === 'provider_stream').length
    const lCount = sorted.filter((e) => e.source === 'lifecycle_event').length
    L.push(
      `══ Step ${step.step} (${step.turnId?.slice(0, 12) ?? '?'})  ${new Date(step.startedAt).toLocaleTimeString()}  ${dur} ══`,
    )
    L.push(`   provider: ${pCount}  lifecycle: ${lCount}`)
    L.push('')
    formatMergedTimeline(sorted, L, trace.startedAt)
    L.push('')
  }

  const runEvts = trace.runEvents ?? []
  if (runEvts.length > 0) {
    const sorted = [...runEvts].toSorted((a, b) => a.seq - b.seq)
    L.push('══ Run-level Events ══')
    formatRawTimeline(sorted, L, trace.startedAt)
    L.push('')
  }
}

/** Detail mode: merge P events with L events into timeline */
function formatMergedTimeline(events: TraceEventEntry[], L: string[], base: number): void {
  let i = 0
  while (i < events.length) {
    const e = events[i]

    // Fold consecutive same-source deltas
    if (isDeltaType(e)) {
      let count = 1
      let totalLen = getDeltaLen(e)
      while (i + count < events.length && events[i + count].type === e.type && events[i + count].source === e.source) {
        totalLen += getDeltaLen(events[i + count])
        count++
      }
      if (count > 1) {
        const tag = sourceTag(e.source)
        const ci = getContentIndex(e)
        const tc = getToolCallId(e)
        const tn = getToolName(e)
        L.push(
          `   │ ${tag} ${seqLabel(e.seq)}  ${tOff(e.timestamp, base)}  ${e.type} ×${count} (~${totalLen} chars)${ci}${tc}${tn}`,
        )
        i += count
        continue
      }
    }

    // Single event
    formatSingleEvent(e, sourceTag(e.source), L, base)
    i++
  }
}

// ---------------------------------------------------------------------------
// Raw mode — every event on its own line (previous behavior)
// ---------------------------------------------------------------------------

function formatRawBody(trace: TraceRunV2, L: string[]): void {
  for (const step of trace.steps) {
    const dur = step.endedAt ? `${step.endedAt - step.startedAt}ms` : 'in-flight'
    const sorted = [...step.events].toSorted((a, b) => a.seq - b.seq)
    const pCount = sorted.filter((e) => e.source === 'provider_stream').length
    const lCount = sorted.filter((e) => e.source === 'lifecycle_event').length
    L.push(
      `══ Step ${step.step} (${step.turnId?.slice(0, 12) ?? '?'})  ${new Date(step.startedAt).toLocaleTimeString()}  ${dur} ══`,
    )
    L.push(`   provider: ${pCount}  lifecycle: ${lCount}`)
    L.push('')
    formatRawTimeline(sorted, L, trace.startedAt)
    L.push('')
  }

  const runEvts = trace.runEvents ?? []
  if (runEvts.length > 0) {
    const sorted = [...runEvts].toSorted((a, b) => a.seq - b.seq)
    L.push('══ Run-level Events ══')
    formatRawTimeline(sorted, L, trace.startedAt)
    L.push('')
  }
}

/** Raw timeline: fold consecutive same-source deltas, but no P+A merging */
function formatRawTimeline(events: TraceEventEntry[], L: string[], base: number): void {
  let i = 0
  while (i < events.length) {
    const e = events[i]
    const tag = sourceTag(e.source)

    if (isDeltaType(e)) {
      let count = 1
      let totalLen = getDeltaLen(e)
      while (i + count < events.length && events[i + count].type === e.type && events[i + count].source === e.source) {
        totalLen += getDeltaLen(events[i + count])
        count++
      }
      if (count > 1) {
        const ci = getContentIndex(e)
        const tc = getToolCallId(e)
        const tn = getToolName(e)
        L.push(
          `   │ ${tag} ${seqLabel(e.seq)}  ${tOff(e.timestamp, base)}  ${e.type} ×${count} (~${totalLen} chars)${ci}${tc}${tn}`,
        )
        i += count
        continue
      }
    }

    formatSingleEvent(e, tag, L, base)
    i++
  }
}

// ---------------------------------------------------------------------------
// Shared formatting helpers
// ---------------------------------------------------------------------------

function sourceTag(source: string): string {
  switch (source) {
    case 'provider_stream':
      return '[P]'
    case 'lifecycle_event':
      return '[L]'
    default:
      return '[?]'
  }
}

function formatSingleEvent(e: TraceEventEntry, tag: string, L: string[], base: number): void {
  switch (e.source) {
    case 'provider_stream':
      formatProviderEvent(e as ProviderStreamTraceEvent, tag, L, base)
      break
    case 'lifecycle_event':
      formatLifecycleEvent(e as LifecycleTraceEvent, tag, L, base)
      break
  }
}

function isDeltaType(e: TraceEventEntry): boolean {
  return (
    e.type === 'text_delta' ||
    e.type === 'thinking_delta' ||
    e.type === 'toolcall_delta' ||
    e.type === 'tool_output_delta'
  )
}

function getDeltaLen(e: TraceEventEntry): number {
  if ('deltaPreview' in e && e.deltaPreview) return e.deltaPreview.length
  return 0
}

function getContentIndex(e: TraceEventEntry): string {
  if ('contentIndex' in e && e.contentIndex !== null) return ` ci=${e.contentIndex}`
  return ''
}

function getToolCallId(e: TraceEventEntry): string {
  if ('toolCallId' in e && e.toolCallId) return ` tc=${e.toolCallId.slice(0, 8)}`
  return ''
}

function getToolName(e: TraceEventEntry): string {
  if ('toolName' in e && e.toolName) return ` ${e.toolName}`
  return ''
}

function formatProviderEvent(e: ProviderStreamTraceEvent, tag: string, L: string[], base: number): void {
  const parts = [`   │ ${tag} ${seqLabel(e.seq)}  ${tOff(e.timestamp, base)}  ${e.type}`]
  if (e.contentIndex !== null) parts.push(`ci=${e.contentIndex}`)
  if (e.toolCallId) parts.push(`tc=${e.toolCallId.slice(0, 8)}`)
  if (e.toolName) parts.push(e.toolName)
  if (e.stopReason) parts.push(`stop=${e.stopReason}`)
  if (e.contentPreview) parts.push(`"${e.contentPreview.slice(0, 60)}${e.contentPreview.length > 60 ? '…' : ''}"`)
  if (e.argsPreview) parts.push(`args=${e.argsPreview.slice(0, 60)}${e.argsPreview.length > 60 ? '…' : ''}`)
  L.push(parts.join('  '))
}

function formatLifecycleEvent(e: LifecycleTraceEvent, tag: string, L: string[], base: number): void {
  const parts = [`   │ ${tag} ${seqLabel(e.seq)}  ${tOff(e.timestamp, base)}  ${e.type}`]
  if (e.toolCallId) parts.push(`tc=${e.toolCallId.slice(0, 8)}`)
  if (e.toolName) parts.push(e.toolName)
  if (e.phase) parts.push(e.phase)
  if (e.reason) parts.push(e.reason)
  if (e.question) parts.push(`"${e.question.slice(0, 60)}${e.question.length > 60 ? '…' : ''}"`)
  if (e.usageSnapshot) parts.push(`${e.usageSnapshot.totalTokens}tok $${e.usageSnapshot.cost.total.toFixed(4)}`)
  if (e.interruptSource) parts.push(`source=${e.interruptSource}`)
  if (e.requestedAt != null && e.observedAt != null) {
    parts.push(`requested=${tOff(e.requestedAt, base)}`)
    parts.push(`observed=${tOff(e.observedAt, base)}`)
  }
  if (e.latencyMs != null) parts.push(`latency=${e.latencyMs}ms`)
  L.push(parts.join('  '))
}

function seqLabel(seq: number | undefined | null): string {
  return seq != null && !Number.isNaN(seq) ? `seq=${seq}` : ''
}

function tOff(ts: number, base: number): string {
  const diff = ts - base
  return !Number.isNaN(diff) ? `t+${diff}ms` : ''
}
