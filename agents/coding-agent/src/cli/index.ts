import { loadConfig } from '@codelord/config'
import type { CodelordConfig } from '@codelord/config'
import { readFileSync } from 'node:fs'
import { cac } from 'cac'
import { runInit } from './init.js'
import { resolveModel } from './run.js'
import { startRepl } from './repl.js'
import { resolveApiKey } from '../auth/index.js'
import { SessionStore } from '../session-store.js'
import { TraceStore, workspaceId, formatTraceList, formatTraceShow } from '../trace-store.js'
import { runHeadless } from './headless.js'
import type { HeadlessProgressEvent } from './headless.js'

interface CliFlags {
  model?: string
  provider?: string
  maxSteps?: number
  resume?: string
}

function readVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
  ) as { version: string }

  return packageJson.version
}

function toConfigOverrides(flags: CliFlags): Partial<CodelordConfig> {
  return {
    ...(flags.model ? { model: flags.model } : {}),
    ...(flags.provider ? { provider: flags.provider } : {}),
    ...(flags.maxSteps !== undefined ? { maxSteps: flags.maxSteps } : {}),
  }
}

function readFlags(options: Record<string, unknown>): CliFlags {
  return {
    model: typeof options.model === 'string' ? options.model : undefined,
    provider: typeof options.provider === 'string' ? options.provider : undefined,
    maxSteps: typeof options.maxSteps === 'number' ? options.maxSteps : undefined,
    resume: typeof options.resume === 'string' ? options.resume : options.resume === true ? 'latest' : undefined,
  }
}

// ---------------------------------------------------------------------------
// Session list formatting
// ---------------------------------------------------------------------------

function relativeTime(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatSessionList(store: SessionStore): string {
  const metas = store.listAll()
  if (metas.length === 0) return 'No sessions found.'

  const lines: string[] = ['Sessions (most recent first):', '']
  for (const meta of metas.slice(0, 20)) {
    const state = meta.wasInFlight ? `${meta.runtimeState} (interrupted)` : meta.runtimeState
    const question = meta.hasPendingQuestion ? ' [waiting_user]' : ''
    const queue = meta.pendingInboundCount > 0 ? ` [queue: ${meta.pendingInboundCount}]` : ''
    const branch = meta.gitBranch ? ` · ${meta.gitBranch}` : ''

    lines.push(`  ${meta.sessionId}`)
    if (meta.title) lines.push(`    "${meta.title}"`)
    lines.push(`    ${meta.cwd}${branch}`)
    lines.push(`    ${state}${question}${queue} · ${meta.messageCount} msgs · ${relativeTime(meta.updatedAt)}`)
    if (meta.summary) lines.push(`    Last: "${meta.summary.length > 80 ? meta.summary.slice(0, 77) + '...' : meta.summary}"`)
    lines.push('')
  }
  if (metas.length > 20) {
    lines.push(`  ... and ${metas.length - 20} more`)
  }
  lines.push('To resume: codelord --resume <id>')
  lines.push('           codelord --resume latest')
  return lines.join('\n')
}

function formatSessionShow(store: SessionStore, sessionId: string): string {
  // Prefix match
  const metas = store.listAll()
  const matches = metas.filter(m => m.sessionId.startsWith(sessionId))
  if (matches.length === 0) return `Session not found: ${sessionId}`
  if (matches.length > 1) {
    const lines = [`Session id prefix is ambiguous: ${sessionId}`, 'Candidates:']
    for (const m of matches) lines.push(`  ${m.sessionId}  ${relativeTime(m.updatedAt)}`)
    return lines.join('\n')
  }

  const meta = matches[0]!
  const snapshot = store.loadSnapshot(meta.sessionId)
  const state = meta.wasInFlight ? `${meta.runtimeState} (interrupted)` : meta.runtimeState
  const branch = meta.gitBranch ? ` · ${meta.gitBranch}` : ''

  const lines: string[] = [
    `Session: ${meta.sessionId}`,
    '',
    `  Title:    ${meta.title ?? '(none)'}`,
    `  CWD:      ${meta.cwd}${branch}`,
    `  Provider:  ${meta.provider} / ${meta.model}`,
    `  State:    ${state}`,
    `  Messages: ${meta.messageCount}`,
    `  Created:  ${new Date(meta.createdAt).toLocaleString()} (${relativeTime(meta.createdAt)})`,
    `  Updated:  ${new Date(meta.updatedAt).toLocaleString()} (${relativeTime(meta.updatedAt)})`,
  ]

  // Usage telemetry
  if (snapshot?.usageAggregate && snapshot.usageAggregate.totalTokens > 0) {
    const u = snapshot.usageAggregate
    lines.push('')
    lines.push(`  Usage:`)
    lines.push(`    Tokens:  ${u.totalTokens} total (${u.input} in / ${u.output} out)`)
    lines.push(`    LLM calls: ${u.llmCalls}`)
    if (u.cost.total > 0) lines.push(`    Cost:    $${u.cost.total.toFixed(4)}`)
  }

  // Tool stats
  if (snapshot?.toolStats) {
    const tools = Object.entries(snapshot.toolStats.tools)
    if (tools.length > 0) {
      lines.push('')
      lines.push(`  Tool stats:`)
      for (const [name, stats] of tools.sort((a, b) => b[1].attempts - a[1].attempts).slice(0, 10)) {
        const errSuffix = stats.failures > 0 ? ` (${stats.failures} errors)` : ''
        lines.push(`    ${name}: ${stats.attempts} calls${errSuffix}`)
      }
    }
  }

  // Recent messages
  if (snapshot && snapshot.messages.length > 0) {
    lines.push('')
    lines.push(`  Recent messages:`)
    const recent = snapshot.messages.slice(-5)
    for (const msg of recent) {
      const role = msg.role
      let preview = ''
      if (typeof msg.content === 'string') {
        preview = msg.content
      } else if (Array.isArray((msg as any).content)) {
        const textBlock = (msg as any).content.find((b: any) => b.type === 'text')
        preview = textBlock?.text ?? `[${(msg as any).content.length} blocks]`
      }
      if (preview.length > 80) preview = preview.slice(0, 77) + '...'
      lines.push(`    [${role}] ${preview}`)
    }
  }

  if (meta.summary) {
    lines.push('')
    lines.push(`  Summary: ${meta.summary}`)
  }

  return lines.join('\n')
}

function createCli() {
  const cli = cac('codelord')

  cli
    .version(readVersion())
    .help()
    .usage('[options]')
    .option('--model <name>', 'Override model')
    .option('--provider <name>', 'Override provider')
    .option('--max-steps <n>', 'Override max steps', { type: [Number] })
    .option('--resume [id]', 'Resume a session (use "latest" or a session id)')
    .option('-p, --print <prompt>', 'Run headless with the given prompt, then exit. Use - to read from stdin.')
    .option('--output-format <format>', 'Output format for -p mode: text (default), json, stream-json')

  cli
    .command('init', 'Initialize configuration')
    .action(async () => {
      await runInit()
    })

  cli
    .command('config', 'Show current configuration')
    .action(async (options) => {
      const config = loadConfig(toConfigOverrides(readFlags(options)))
      console.log(JSON.stringify(config, null, 2))
    })

  cli
    .command('help', 'Show help')
    .action(() => {
      cli.outputHelp()
    })

  return cli
}

// ---------------------------------------------------------------------------
// Pipe mode (-p flag) — headless single-shot with streaming progress
// ---------------------------------------------------------------------------

type OutputFormat = 'text' | 'json' | 'stream-json'

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return ''
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf-8').trim()
}

function buildProgressCallback(format: OutputFormat): ((event: HeadlessProgressEvent) => void) | undefined {
  switch (format) {
    case 'text':
      return (event) => {
        switch (event.type) {
          case 'turn_start':
            process.stderr.write('[Turn start]\n')
            break
          case 'tool_call':
            if (event.phase === 'started') {
              process.stderr.write(`  → ${event.toolName}...`)
            } else {
              process.stderr.write(event.isError ? ' ✗\n' : ' ✓\n')
            }
            break
          case 'done':
            process.stderr.write(`\n[Done] ${event.outcome} in ${(event.durationMs / 1000).toFixed(1)}s | ${event.totalTokens} tokens | $${event.cost.toFixed(4)}\n`)
            break
        }
      }
    case 'json':
      return undefined
    case 'stream-json':
      return (event) => {
        process.stdout.write(JSON.stringify(event) + '\n')
      }
  }
}

async function handlePipeMode(prompt: string, outputFormat: OutputFormat, cliFlags: CliFlags): Promise<void> {
  const config = loadConfig(toConfigOverrides(cliFlags))
  const model = resolveModel(config)
  const apiKey = await resolveApiKey(config)

  const onProgress = buildProgressCallback(outputFormat)
  const result = await runHeadless({
    model, apiKey, config, prompt, onProgress,
    streaming: outputFormat === 'stream-json',
  })

  switch (outputFormat) {
    case 'text':
      if (result.text) process.stdout.write(result.text + '\n')
      break
    case 'json':
      process.stdout.write(JSON.stringify({
        outcome: result.outcome,
        text: result.text,
        durationMs: result.durationMs,
        toolStats: result.toolStats,
        traceRunId: result.trace.runId,
        usage: {
          totalTokens: result.trace.usageSummary.totalTokens,
          cost: result.trace.usageSummary.cost.total,
        },
      }, null, 2) + '\n')
      break
    case 'stream-json':
      process.stdout.write(JSON.stringify({
        type: 'result',
        outcome: result.outcome.type,
        text: result.text,
        durationMs: result.durationMs,
        traceRunId: result.trace.runId,
      }) + '\n')
      break
  }

  switch (result.outcome.type) {
    case 'success': process.exitCode = 0; break
    case 'error': process.exitCode = 1; break
    default: process.exitCode = 2; break
  }
}

// ---------------------------------------------------------------------------
// Run subcommand handler — headless single-shot execution (legacy)
// ---------------------------------------------------------------------------

async function handleRunCommand(args: string[]): Promise<void> {
  const flags = new Set(args.filter(a => a.startsWith('--')))
  const positional = args.filter(a => !a.startsWith('--'))
  const prompt = positional[0]

  if (!prompt) {
    console.error('Usage: codelord run "<prompt>" [--json] [--trace]')
    process.exitCode = 1
    return
  }

  const config = loadConfig()
  const model = resolveModel(config)
  const apiKey = await resolveApiKey(config)

  const result = await runHeadless({ model, apiKey, config, prompt })

  if (flags.has('--trace')) {
    console.log(JSON.stringify(result.trace, null, 2))
  } else if (flags.has('--json')) {
    console.log(JSON.stringify({
      outcome: result.outcome,
      text: result.text,
      durationMs: result.durationMs,
      toolStats: result.toolStats,
      traceRunId: result.trace.runId,
    }, null, 2))
  } else {
    if (result.text) console.log(result.text)
  }

  if (result.outcome.type === 'error') process.exitCode = 1
}

export { handleRunCommand }
// ---------------------------------------------------------------------------

function handleTraceCommand(args: string[]): void {
  const positional = args.filter(a => !a.startsWith('-'))
  const flags = new Set(args.filter(a => a.startsWith('-')))
  const sub = positional[0] ?? 'list'

  if (sub === 'list') {
    const store = new TraceStore()
    const all = flags.has('--all')
    const limitIdx = args.indexOf('--limit')
    const limit = limitIdx >= 0 && args[limitIdx + 1] ? Number(args[limitIdx + 1]) : 20
    const wsId = all ? undefined : workspaceId(process.cwd())
    console.log(formatTraceList(store.list({ workspaceId: wsId, limit })))
  } else if (sub === 'show') {
    const runId = positional[1]
    if (!runId) {
      console.error('Usage: codelord trace show <runId>')
      process.exitCode = 1
      return
    }
    const store = new TraceStore()
    const result = store.findByPrefix(runId)
    switch (result.type) {
      case 'exact':
      case 'unique': {
        const mode = flags.has('--raw') ? 'raw' : flags.has('--detail') ? 'detail' : 'summary'
        console.log(formatTraceShow(result.trace, mode))
        break
      }
      case 'ambiguous': {
        console.error(`Trace id prefix is ambiguous: ${runId}`)
        console.error('Candidates:')
        for (const c of result.candidates) {
          console.error(`  ${c.runId}  ${new Date(c.startedAt).toLocaleString()}  ${c.outcome}  ${c.workspaceSlug}`)
        }
        process.exitCode = 1
        break
      }
      case 'not_found':
        console.error(`Trace not found: ${runId}`)
        process.exitCode = 1
        break
    }
  } else {
    console.error(`Unknown trace subcommand: ${sub}\nUsage: codelord trace list [--all] [--limit N]\n       codelord trace show <runId> [--detail|--raw]`)
    process.exitCode = 1
  }
}

// Exported for testing
export { handleTraceCommand }

function handleSessionsCommand(args: string[]): void {
  const positional = args.filter(a => !a.startsWith('-'))
  const flags = new Set(args.filter(a => a.startsWith('-')))
  const sub = positional[0] ?? 'list'
  const store = new SessionStore()

  if (sub === 'list' || (!positional[0] && args.length === 0)) {
    console.log(formatSessionList(store))
  } else if (sub === 'show') {
    const id = positional[1]
    if (!id) {
      console.error('Usage: codelord sessions show <id>')
      process.exitCode = 1
      return
    }
    console.log(formatSessionShow(store, id))
  } else if (sub === 'prune') {
    const daysIdx = args.indexOf('--days')
    const days = daysIdx >= 0 && args[daysIdx + 1] ? Number(args[daysIdx + 1]) : 7
    const all = flags.has('--all')
    const force = flags.has('--force')

    const metas = store.listAll()
    const cutoff = all ? Infinity : Date.now() - days * 24 * 60 * 60 * 1000
    const toDelete = all ? metas : metas.filter(m => m.updatedAt < cutoff)

    if (toDelete.length === 0) {
      console.log(all ? 'No sessions found.' : `No sessions older than ${days} days.`)
      return
    }

    console.log(`Will delete ${toDelete.length} session(s):`)
    for (const m of toDelete.slice(0, 10)) {
      const title = m.title ? ` "${m.title}"` : ''
      console.log(`  ${m.sessionId.slice(0, 8)}...${title}  ${relativeTime(m.updatedAt)}`)
    }
    if (toDelete.length > 10) console.log(`  ... and ${toDelete.length - 10} more`)

    if (!force) {
      process.stdout.write('\nConfirm? [y/N] ')
      const answer = readLineSync()
      if (answer.toLowerCase() !== 'y') {
        console.log('Aborted.')
        return
      }
    }

    for (const m of toDelete) store.delete(m.sessionId)
    console.log(`Deleted ${toDelete.length} session(s).`)
  } else {
    console.error(`Unknown sessions subcommand: ${sub}\nUsage: codelord sessions [list|show <id>|prune [--days N|--all] [--force]]`)
    process.exitCode = 1
  }
}

function readLineSync(): string {
  const buf = Buffer.alloc(256)
  try {
    const fd = require('node:fs').openSync('/dev/stdin', 'r')
    const n = require('node:fs').readSync(fd, buf, 0, 256)
    require('node:fs').closeSync(fd)
    return buf.slice(0, n).toString('utf-8').trim()
  } catch {
    return ''
  }
}

// Exported for testing
export { handleSessionsCommand }

export async function runCli(argv = process.argv): Promise<void> {
  // --- Handle subcommands before cac parsing ---
  // cac doesn't support multi-word commands well, so we intercept here.
  const rawArgs = argv.slice(2) // strip 'node' and script path
  if (rawArgs[0] === 'trace') {
    handleTraceCommand(rawArgs.slice(1))
    return
  }

  if (rawArgs[0] === 'sessions') {
    handleSessionsCommand(rawArgs.slice(1))
    return
  }

  if (rawArgs[0] === 'run') {
    await handleRunCommand(rawArgs.slice(1))
    return
  }

  const cli = createCli()
  cli.parse(argv, { run: false })

  if (cli.options.help || cli.options.version) {
    return
  }

  if (cli.matchedCommand) {
    await cli.runMatchedCommand()
    return
  }

  // Handle -p / --print (headless pipe mode)
  if (cli.options.print) {
    let prompt = String(cli.options.print)

    // If prompt is empty or '-', read from stdin
    if (!prompt || prompt === '-' || prompt === 'true') {
      prompt = await readStdin()
      if (!prompt) {
        console.error('Error: no prompt provided. Usage: codelord -p "prompt" or echo "prompt" | codelord -p')
        process.exitCode = 1
        return
      }
    }

    const outputFormat = (cli.options.outputFormat ?? 'text') as OutputFormat
    await handlePipeMode(prompt, outputFormat, readFlags(cli.options))
    return
  }

  // Positional args are no longer supported — always enter REPL
  if (cli.args.length > 0) {
    console.error(
      `Single-shot mode has been removed. Use the interactive shell instead:\n` +
      `  $ codelord\n` +
      `Then type your message at the prompt.`,
    )
    process.exitCode = 1
    return
  }

  const flags = readFlags(cli.options)
  const config = loadConfig(toConfigOverrides(flags))
  const model = resolveModel(config)
  const apiKey = await resolveApiKey(config)

  // Resolve resume target (if any)
  let resumeSessionId: string | undefined
  if (flags.resume) {
    const store = new SessionStore()
    if (flags.resume === 'latest') {
      const latest = store.findLatest()
      if (!latest) {
        console.error('No sessions found to resume.')
        process.exitCode = 1
        return
      }
      resumeSessionId = latest.sessionId
    } else {
      // Treat as session ID
      const meta = store.loadMeta(flags.resume)
      if (!meta) {
        console.error(`Session not found: ${flags.resume}`)
        process.exitCode = 1
        return
      }
      resumeSessionId = flags.resume
    }
  }

  await startRepl({ model, apiKey, config, resumeSessionId })
}

void runCli().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Error: ${message}`)
  process.exitCode = 1
})
