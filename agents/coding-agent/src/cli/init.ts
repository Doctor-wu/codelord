import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { cancel, confirm, intro, isCancel, note, outro, password, select, text } from '@clack/prompts'
import { getModels, getProviders } from '@mariozechner/pi-ai'
import { getOAuthProvider } from '@mariozechner/pi-ai/oauth'

const CONFIG_DIR = join(homedir(), '.codelord')
const CONFIG_PATH = join(CONFIG_DIR, 'config.toml')
const DISPLAY_PATH = '~/.codelord/config.toml'

function escapeTomlString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')
}

function renderConfigToml(provider: string, model: string, apiKey?: string): string {
  const lines = [`provider = "${escapeTomlString(provider)}"`, `model = "${escapeTomlString(model)}"`]

  if (apiKey) {
    lines.push(`apiKey = "${escapeTomlString(apiKey)}"`)
  }

  return `${lines.join('\n')}\n`
}

function promptValueOrExit<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel('Initialization cancelled.')
    process.exit(0)
  }
  return value
}

function getProviderOptions(): Array<{ value: string; label: string; hint?: string }> {
  const oauthProviders = new Set(getProviders().filter((provider) => getOAuthProvider(provider)))

  return getProviders().map((provider) => ({
    value: provider,
    label: provider,
    hint: oauthProviders.has(provider) ? 'OAuth' : 'API key',
  }))
}

export async function runInit(): Promise<void> {
  intro('codelord init')

  if (existsSync(CONFIG_PATH)) {
    const shouldOverwrite = promptValueOrExit(
      await confirm({
        message: `Config already exists at ${DISPLAY_PATH}. Overwrite it?`,
        initialValue: false,
      }),
    )

    if (!shouldOverwrite) {
      outro('Initialization cancelled.')
      return
    }
  }

  const provider = promptValueOrExit(
    await select({
      message: 'Choose a provider',
      options: getProviderOptions(),
      initialValue: 'openai-codex',
    }),
  )

  const models = getModels(provider as never)
  const recommendedModel = models[0]?.id

  if (!recommendedModel) {
    throw new Error(`No models available for provider "${provider}" from pi-ai`)
  }

  let apiKey: string | undefined
  if (getOAuthProvider(provider)) {
    note(`No API key needed for ${provider}. codelord will use pi-ai's OAuth flow on first run.`, 'Authentication')
  } else {
    apiKey = promptValueOrExit(
      await password({
        message: `Enter the API key for ${provider}`,
        mask: '*',
        validate(value) {
          if (!value?.trim()) return 'API key is required for this provider.'
        },
      }),
    )
  }

  const model = promptValueOrExit(
    await select({
      message: 'Choose the default model',
      options: models.map((candidate) => ({
        value: candidate.id,
        label: candidate.id,
        hint: candidate.name,
      })),
      initialValue: recommendedModel,
    }),
  )

  mkdirSync(dirname(CONFIG_PATH), { recursive: true })
  writeFileSync(CONFIG_PATH, renderConfigToml(provider, model, apiKey))

  outro(`Config saved to ${DISPLAY_PATH}\nRun: codelord "your task here"`)
}
