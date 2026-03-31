import { loadConfig } from '@agent/config'
import type { CodelordConfig } from '@agent/config'
import { readFileSync } from 'node:fs'
import { parseArgs, type CliFlags } from './parse-args.js'
import { runInit } from './init.js'

const HELP_TEXT = `codelord — AI coding agent

Usage:
  codelord "message"         Run agent with a task
  codelord init              Initialize configuration
  codelord config            Show current configuration

Options:
  --plain                    Plain text output (no TUI)
  --model <name>             Override model
  --provider <name>          Override provider
  --max-steps <n>            Override max steps
  -h, --help                 Show help
  -v, --version              Show version`

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

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2))

  switch (parsed.command) {
    case 'help':
      console.log(HELP_TEXT)
      return

    case 'version':
      console.log(readVersion())
      return

    case 'init':
      await runInit()
      return

    case 'config': {
      const config = loadConfig(toConfigOverrides(parsed.flags))
      console.log(JSON.stringify(config, null, 2))
      return
    }

    case 'run':
      console.log(`TODO: run agent with message: ${parsed.message}`)
      return
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Error: ${message}`)
  process.exitCode = 1
})
