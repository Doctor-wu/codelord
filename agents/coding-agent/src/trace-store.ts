// ---------------------------------------------------------------------------
// TraceStore -- workspace-aware trace persistence
// ---------------------------------------------------------------------------
//
// Layout:
//   ~/.codelord/workspaces/<slug>/
//     traces/<runId>.json
// ---------------------------------------------------------------------------

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { TraceRunV2, TraceEventEntry, ProviderStreamTraceEvent, LifecycleTraceEvent } from '@codelord/core'
import { normalizeTrace } from '@codelord/core'
import { resolveCodelordHome, tracesDir as tracesDirOf } from '@codelord/config'

// Re-export workspace utilities from @codelord/config for existing callers
export { workspaceSlug, workspaceId } from '@codelord/config'

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
// TraceStore (per-workspace write path)
// ---------------------------------------------------------------------------

export interface TraceStoreOptions {
  /** Absolute path to `~/.codelord/workspaces/<slug>/`. Required. */
  workspaceDir: string
}

export class TraceStore {
  private readonly baseDir: string

  constructor(opts: TraceStoreOptions) {
    this.baseDir = tracesDirOf(opts.workspaceDir)
  }

  save(trace: TraceRunV2): void {
    mkdirSync(this.baseDir, { recursive: true })
    writeFileSync(join(this.baseDir, `${trace.runId}.json`), JSON.stringify(trace, null, 2), 'utf-8')
  }

  load(runId: string): TraceRunV2 | null {
    const file = join(this.baseDir, `${runId}.json`)
    if (!existsSync(file)) return null
    try {
      return JSON.parse(readFileSync(file, 'utf-8')) as TraceRunV2
    } catch {
      return null
    }
  }
}

// ---------------------------------------------------------------------------
// Cross-workspace helpers (for CLI commands)
// ---------------------------------------------------------------------------

/** List traces across all workspaces under codelordHome. */
export function listAllTraces(opts?: {
  codelordHome?: string
  /** Filter by workspace slug (flattened cwd). Use `workspaceSlug(cwd)` to compute. */
  filterSlug?: string
  limit?: number
}): TraceSummary[] {
  const home = opts?.codelordHome ?? resolveCodelordHome()
  const workspacesRoot = join(home, 'workspaces')
  if (!existsSync(workspacesRoot)) return []
  const limit = opts?.limit ?? 20
  const filterSlug = opts?.filterSlug
  const summaries: TraceSummary[] = []
  try {
    const wsDirs = readdirSync(workspacesRoot, { withFileTypes: true })
    for (const ws of wsDirs) {
      if (!ws.isDirectory()) continue
      if (filterSlug && ws.name !== filterSlug) continue
      const tracesPath = join(workspacesRoot, ws.name, 'traces')
      if (!existsSync(tracesPath)) continue
      const files = readdirSync(tracesPath).filter((f) => f.endsWith('.json'))
      for (const file of files) {
        try {
          const trace = JSON.parse(readFileSync(join(tracesPath, file), 'utf-8')) as TraceRunV2
          summaries.push({
            runId: trace.runId,
            sessionId: trace.sessionId,
            workspaceSlug: trace.workspaceSlug ?? ws.name,
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

  summaries.sort((a, b) => b.startedAt - a.startedAt)
  return summaries.slice(0, limit)
}

/** Find a trace by runId prefix across all workspaces. */
export function findTraceByPrefix(prefix: string, codelordHome?: string): PrefixMatchResult {
  const home = codelordHome ?? resolveCodelordHome()
  const workspacesRoot = join(home, 'workspaces')
  if (!existsSync(workspacesRoot)) return { type: 'not_found' }
  const candidates: { file: string; wsPath: string; runId: string; wsSlug: string }[] = []
  try {
    const wsDirs = readdirSync(workspacesRoot, { withFileTypes: true })
    for (const ws of wsDirs) {
      if (!ws.isDirectory()) continue
      const tracesPath = join(workspacesRoot, ws.name, 'traces')
      if (!existsSync(tracesPath)) continue
      const files = readdirSync(tracesPath).filter((f) => f.endsWith('.json'))
      for (const f of files) {
        const fRunId = f.slice(0, -5)
        if (fRunId === prefix) {
          const trace = JSON.parse(readFileSync(join(tracesPath, f), 'utf-8')) as TraceRunV2
          return { type: 'exact', trace }
        }
        if (prefix.length >= 4 && fRunId.startsWith(prefix)) {
          candidates.push({ file: f, wsPath: tracesPath, runId: fRunId, wsSlug: ws.name })
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
  const ambiguous: PrefixCandidate[] = candidates.map((c) => {
    try {
      const trace = JSON.parse(readFileSync(join(c.wsPath, c.file), 'utf-8')) as TraceRunV2
      return {
        runId: c.runId,
        workspaceSlug: c.wsSlug,
        workspaceId: trace.workspaceId ?? '',
        startedAt: trace.startedAt,
        outcome: trace.outcome.type,
      }
    } catch {
      return { runId: c.runId, workspaceSlug: c.wsSlug, workspaceId: '', startedAt: 0, outcome: 'unknown' }
    }
  })
  return { type: 'ambiguous', candidates: ambiguous }
}

function extractPromptPreview(trace: TraceRunV2): string {
  for (const step of trace.steps) {
    for (const e of step.events) {
      if (e.source === 'lifecycle_event' && e.type === 'user_turn' && (e as LifecycleTraceEvent).question) {
        const text = (e as LifecycleTraceEvent).question!
        return text.length > 20 ? text.slice(0, 20) + '\u2026' : text
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
    `Time: ${new Date(trace.startedAt).toLocaleString()} \u2192 ${new Date(trace.endedAt).toLocaleString()} (${Math.round((trace.endedAt - trace.startedAt) / 1000)}s)`,
  )
  L.push(
    `Outcome: ${trace.outcome.type}${trace.outcome.error ? ` \u2014 ${trace.outcome.error}` : ''}${trace.outcome.reason ? ` \u2014 ${trace.outcome.reason}` : ''}`,
  )
  L.push(
    `Usage: ${trace.usageSummary.totalTokens} tok  ${trace.usageSummary.llmCalls} LLM calls  $${trace.usageSummary.cost.total.toFixed(4)}`,
  )
  L.push(
    `  input: ${trace.usageSummary.input}  output: ${trace.usageSummary.output}  cacheRead: ${trace.usageSummary.cacheRead}  cacheWrite: ${trace.usageSummary.cacheWrite}`,
  )
  L.push(`Events: ${trace.eventCounts.providerStream} provider  ${trace.eventCounts.lifecycleEvents} lifecycle`)
  if (trace.redactionSummary.length > 0) {
    L.push(`Redactions: ${trace.redactionSummary.map((r) => `${r.type}\u00d7${r.count}`).join(', ')}`)
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
// Summary mode -- chronological trajectory narrative
// ---------------------------------------------------------------------------

function formatSummaryBody(trace: TraceRunV2, L: string[]): void {
  const allLifecycle: { event: LifecycleTraceEvent; stepEvents?: TraceEventEntry[] }[] = []

  for (const e of trace.runEvents ?? []) {
    if (e.source === 'lifecycle_event') {
      allLifecycle.push({ event: e as LifecycleTraceEvent })
    }
  }

  for (const step of trace.steps) {
    const sorted = [...step.events].toSorted((a, b) => a.seq - b.seq)
    const firstSeq = sorted.length > 0 ? sorted[0].seq : 0
    const dur = step.endedAt ? `${((step.endedAt - step.startedAt) / 1000).toFixed(1)}s` : 'in-flight'

    let segHeader: string | null = null
    if (trace.segments && trace.segments.length > 1) {
      const seg = trace.segments.find((s) => step.step >= s.stepRange[0] && step.step <= s.stepRange[1])
      if (seg && step.step === seg.stepRange[0]) {
        segHeader = `\u2500\u2500 Segment ${seg.segmentIndex} (${seg.outcome.type})  ${new Date(seg.startedAt).toLocaleTimeString()} \u2500\u2500`
      }
    }

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
        reason: segHeader,
        question: `\u2550\u2550 Step ${step.step}  ${new Date(step.startedAt).toLocaleTimeString()}  ${dur} \u2550\u2550`,
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

  allLifecycle.sort((a, b) => a.event.seq - b.event.seq)

  for (const { event, stepEvents } of allLifecycle) {
    if (event.type === '__step_header__') {
      if (event.reason) L.push(event.reason)
      L.push(event.question!)
      continue
    }
    formatTrajectoryEvent(event, L, stepEvents)
  }

  if (allLifecycle.length > 0) L.push('')
}

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

    case 'queue_enqueued':
    case 'queue_drained':
    case 'blocked_enter':
    case 'blocked_exit':
    case 'usage_updated':
    case 'interrupt_observed':
      break

    default:
      L.push(`  [${le.type}]${le.reason ? ' ' + le.reason : ''}${le.question ? ' ' + truncLine(le.question, 80) : ''}`)
      break
  }
}

function truncLine(text: string, max: number): string {
  const flat = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
  return flat.length > max ? flat.slice(0, max) + '\u2026' : flat
}

function fmtNum(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`
}

// ---------------------------------------------------------------------------
// Detail mode -- merged P+A pairs, lifecycle shown separately
// ---------------------------------------------------------------------------

function formatDetailBody(trace: TraceRunV2, L: string[]): void {
  for (const step of trace.steps) {
    const dur = step.endedAt ? `${step.endedAt - step.startedAt}ms` : 'in-flight'
    const sorted = [...step.events].toSorted((a, b) => a.seq - b.seq)
    const pCount = sorted.filter((e) => e.source === 'provider_stream').length
    const lCount = sorted.filter((e) => e.source === 'lifecycle_event').length
    L.push(
      `\u2550\u2550 Step ${step.step} (${step.turnId?.slice(0, 12) ?? '?'})  ${new Date(step.startedAt).toLocaleTimeString()}  ${dur} \u2550\u2550`,
    )
    L.push(`   provider: ${pCount}  lifecycle: ${lCount}`)
    L.push('')
    formatMergedTimeline(sorted, L, trace.startedAt)
    L.push('')
  }

  const runEvts = trace.runEvents ?? []
  if (runEvts.length > 0) {
    const sorted = [...runEvts].toSorted((a, b) => a.seq - b.seq)
    L.push('\u2550\u2550 Run-level Events \u2550\u2550')
    formatRawTimeline(sorted, L, trace.startedAt)
    L.push('')
  }
}

function formatMergedTimeline(events: TraceEventEntry[], L: string[], base: number): void {
  let i = 0
  while (i < events.length) {
    const e = events[i]

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
          `   \u2502 ${tag} ${seqLabel(e.seq)}  ${tOff(e.timestamp, base)}  ${e.type} \u00d7${count} (~${totalLen} chars)${ci}${tc}${tn}`,
        )
        i += count
        continue
      }
    }

    formatSingleEvent(e, sourceTag(e.source), L, base)
    i++
  }
}

// ---------------------------------------------------------------------------
// Raw mode -- every event on its own line (previous behavior)
// ---------------------------------------------------------------------------

function formatRawBody(trace: TraceRunV2, L: string[]): void {
  for (const step of trace.steps) {
    const dur = step.endedAt ? `${step.endedAt - step.startedAt}ms` : 'in-flight'
    const sorted = [...step.events].toSorted((a, b) => a.seq - b.seq)
    const pCount = sorted.filter((e) => e.source === 'provider_stream').length
    const lCount = sorted.filter((e) => e.source === 'lifecycle_event').length
    L.push(
      `\u2550\u2550 Step ${step.step} (${step.turnId?.slice(0, 12) ?? '?'})  ${new Date(step.startedAt).toLocaleTimeString()}  ${dur} \u2550\u2550`,
    )
    L.push(`   provider: ${pCount}  lifecycle: ${lCount}`)
    L.push('')
    formatRawTimeline(sorted, L, trace.startedAt)
    L.push('')
  }

  const runEvts = trace.runEvents ?? []
  if (runEvts.length > 0) {
    const sorted = [...runEvts].toSorted((a, b) => a.seq - b.seq)
    L.push('\u2550\u2550 Run-level Events \u2550\u2550')
    formatRawTimeline(sorted, L, trace.startedAt)
    L.push('')
  }
}

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
          `   \u2502 ${tag} ${seqLabel(e.seq)}  ${tOff(e.timestamp, base)}  ${e.type} \u00d7${count} (~${totalLen} chars)${ci}${tc}${tn}`,
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
  const parts = [`   \u2502 ${tag} ${seqLabel(e.seq)}  ${tOff(e.timestamp, base)}  ${e.type}`]
  if (e.contentIndex !== null) parts.push(`ci=${e.contentIndex}`)
  if (e.toolCallId) parts.push(`tc=${e.toolCallId.slice(0, 8)}`)
  if (e.toolName) parts.push(e.toolName)
  if (e.stopReason) parts.push(`stop=${e.stopReason}`)
  if (e.contentPreview) parts.push(`"${e.contentPreview.slice(0, 60)}${e.contentPreview.length > 60 ? '\u2026' : ''}"`)
  if (e.argsPreview) parts.push(`args=${e.argsPreview.slice(0, 60)}${e.argsPreview.length > 60 ? '\u2026' : ''}`)
  L.push(parts.join('  '))
}

function formatLifecycleEvent(e: LifecycleTraceEvent, tag: string, L: string[], base: number): void {
  const parts = [`   \u2502 ${tag} ${seqLabel(e.seq)}  ${tOff(e.timestamp, base)}  ${e.type}`]
  if (e.toolCallId) parts.push(`tc=${e.toolCallId.slice(0, 8)}`)
  if (e.toolName) parts.push(e.toolName)
  if (e.phase) parts.push(e.phase)
  if (e.reason) parts.push(e.reason)
  if (e.question) parts.push(`"${e.question.slice(0, 60)}${e.question.length > 60 ? '\u2026' : ''}"`)
  if (e.usageSnapshot) parts.push(`${e.usageSnapshot.totalTokens}tok $${e.usageSnapshot.cost.total.toFixed(4)}`)
  if (e.interruptSource) parts.push(`source=${e.interruptSource}`)
  if (e.requestedAt !== undefined && e.requestedAt !== null && e.observedAt !== undefined && e.observedAt !== null) {
    parts.push(`requested=${tOff(e.requestedAt, base)}`)
    parts.push(`observed=${tOff(e.observedAt, base)}`)
  }
  if (e.latencyMs !== undefined) parts.push(`latency=${e.latencyMs}ms`)
  L.push(parts.join('  '))
}

function seqLabel(seq: number | undefined | null): string {
  return seq !== null && seq !== undefined && !Number.isNaN(seq) ? `seq=${seq}` : ''
}

function tOff(ts: number, base: number): string {
  const diff = ts - base
  return !Number.isNaN(diff) ? `t+${diff}ms` : ''
}
