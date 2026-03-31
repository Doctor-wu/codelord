import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import * as readline from 'node:readline/promises'

const CONFIG_DIR = join(homedir(), '.codelord')
const CONFIG_PATH = join(CONFIG_DIR, 'config.toml')
const DISPLAY_PATH = '~/.codelord/config.toml'

const PROVIDERS = ['anthropic', 'openai', 'openai-codex'] as const

const DEFAULT_MODELS: Record<(typeof PROVIDERS)[number], string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-5.4',
  'openai-codex': 'gpt-5.4',
}

function escapeTomlString(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')
}

function renderConfigToml(
  provider: (typeof PROVIDERS)[number],
  model: string,
  apiKey?: string,
): string {
  const lines = [
    `provider = "${escapeTomlString(provider)}"`,
    `model = "${escapeTomlString(model)}"`,
  ]

  if (apiKey) {
    lines.push(`apiKey = "${escapeTomlString(apiKey)}"`)
  }

  return `${lines.join('\n')}\n`
}

async function selectProvider(rl: readline.Interface): Promise<(typeof PROVIDERS)[number]> {
  console.log('Select a provider:')
  console.log('  1. anthropic')
  console.log('  2. openai')
  console.log('  3. openai-codex')

  while (true) {
    const answer = (await rl.question('Provider [1]: ')).trim()

    if (answer === '' || answer === '1' || answer === 'anthropic') return 'anthropic'
    if (answer === '2' || answer === 'openai') return 'openai'
    if (answer === '3' || answer === 'openai-codex') return 'openai-codex'

    console.log('Please enter 1, 2, 3, or a provider name.')
  }
}

async function confirmOverwrite(rl: readline.Interface): Promise<boolean> {
  const answer = (await rl.question(`Config already exists at ${DISPLAY_PATH}. Overwrite? (y/N): `))
    .trim()
    .toLowerCase()

  return answer === 'y' || answer === 'yes'
}

export async function runInit(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  try {
    if (existsSync(CONFIG_PATH)) {
      const shouldOverwrite = await confirmOverwrite(rl)
      if (!shouldOverwrite) {
        console.log('Initialization cancelled.')
        return
      }
    }

    const provider = await selectProvider(rl)

    let apiKey: string | undefined
    if (provider === 'openai-codex') {
      console.log('Skipping API key setup for openai-codex. OAuth will be handled automatically.')
    } else {
      apiKey = (await rl.question('API key: ')).trim()
    }

    const suggestedModel = DEFAULT_MODELS[provider]
    const model = (await rl.question(`Default model [${suggestedModel}]: `)).trim() || suggestedModel

    mkdirSync(dirname(CONFIG_PATH), { recursive: true })
    writeFileSync(CONFIG_PATH, renderConfigToml(provider, model, apiKey))

    console.log(`Config saved to ${DISPLAY_PATH}`)
    console.log('You can now run: codelord "your task here"')
  } finally {
    rl.close()
  }
}
