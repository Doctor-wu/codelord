import { loadConfig } from '@agent/config'
import type { CodelordConfig } from '@agent/config'
import { readFileSync } from 'node:fs'
import { cac } from 'cac'
import { runInit } from './init.js'
import { runAgentCommand, resolveModel } from './run.js'
import { startRepl } from './repl.js'
import { resolveApiKey } from '../auth/index.js'

interface CliFlags {
  plain?: boolean
  model?: string
  provider?: string
  maxSteps?: number
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
    plain: options.plain === true,
    model: typeof options.model === 'string' ? options.model : undefined,
    provider: typeof options.provider === 'string' ? options.provider : undefined,
    maxSteps: typeof options.maxSteps === 'number' ? options.maxSteps : undefined,
  }
}

function createCli() {
  const cli = cac('codelord')

  cli
    .version(readVersion())
    .help()
    .usage('"message"')
    .option('--plain', 'Plain text output (no TUI)')
    .option('--model <name>', 'Override model')
    .option('--provider <name>', 'Override provider')
    .option('--max-steps <n>', 'Override max steps', { type: [Number] })

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

  if (cli.args.length === 0) {
    // No message argument — enter interactive REPL
    const flags = readFlags(cli.options)
    const config = loadConfig(toConfigOverrides(flags))
    const model = resolveModel(config)
    const apiKey = await resolveApiKey(config)
    await startRepl({ model, apiKey, config })
    return
  }

  const flags = readFlags(cli.options)
  const config = loadConfig(toConfigOverrides(flags))
  await runAgentCommand(cli.args.join(' '), config, { plain: flags.plain })
}

void runCli().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Error: ${message}`)
  process.exitCode = 1
})
