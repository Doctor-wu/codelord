import { loadConfig } from '@agent/config'
import type { CodelordConfig } from '@agent/config'
import { readFileSync } from 'node:fs'
import { cac } from 'cac'
import { runInit } from './init.js'
import { resolveModel } from './run.js'
import { startRepl } from './repl.js'
import { resolveApiKey } from '../auth/index.js'
import { SessionStore } from '../session-store.js'

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

function formatSessionList(store: SessionStore): string {
  const metas = store.listAll()
  if (metas.length === 0) return 'No sessions found.'

  const lines: string[] = ['Sessions (most recent first):', '']
  for (const meta of metas.slice(0, 20)) {
    const created = new Date(meta.createdAt).toLocaleString()
    const updated = new Date(meta.updatedAt).toLocaleString()
    const state = meta.wasInFlight ? `${meta.runtimeState} (interrupted)` : meta.runtimeState
    const question = meta.hasPendingQuestion ? ' [waiting_user]' : ''
    const queue = meta.pendingInboundCount > 0 ? ` [queue: ${meta.pendingInboundCount}]` : ''
    lines.push(`  ${meta.sessionId}`)
    lines.push(`    cwd:     ${meta.cwd}`)
    lines.push(`    state:   ${state}${question}${queue}`)
    lines.push(`    msgs:    ${meta.messageCount}`)
    lines.push(`    created: ${created}`)
    lines.push(`    updated: ${updated}`)
    lines.push('')
  }
  if (metas.length > 20) {
    lines.push(`  ... and ${metas.length - 20} more`)
  }
  lines.push('To resume: codelord --resume <id>')
  lines.push('           codelord --resume latest')
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
    .command('sessions', 'List saved sessions')
    .action(() => {
      const store = new SessionStore()
      console.log(formatSessionList(store))
    })

  cli
    .command('help', 'Show help')
    .action(() => {
      cli.outputHelp()
    })

  return cli
}

export async function runCli(argv = process.argv): Promise<void> {
  const cli = createCli()
  cli.parse(argv, { run: false })

  if (cli.options.help || cli.options.version) {
    return
  }

  if (cli.matchedCommand) {
    await cli.runMatchedCommand()
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
