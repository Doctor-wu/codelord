import { readFileSync } from 'node:fs'
import { getModels } from '@mariozechner/pi-ai'
import type { Api, Model } from '@mariozechner/pi-ai'
import { runAgent } from '@agent/core'
import type { CodelordConfig } from '@agent/config'
import { resolveApiKey } from '../auth/index.js'
import { InkRenderer, PlainTextRenderer } from '../renderer/index.js'
import type { Renderer } from '../renderer/index.js'
import { createToolKernel } from './tool-kernel.js'
import { buildSystemPrompt } from './system-prompt.js'

function readVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
  ) as { version: string }
  return packageJson.version
}

export function resolveModel(config: CodelordConfig): Model<Api> {
  const models = getModels(config.provider as never) as Model<Api>[]
  const model = models.find((candidate) => candidate.id === config.model)

  if (!model) {
    const availableModels = models.map((candidate) => candidate.id).join(', ')
    throw new Error(
      `Unknown model "${config.model}" for provider "${config.provider}". ` +
      `Available models: ${availableModels}`,
    )
  }

  return model
}

function createRenderer(config: CodelordConfig, plain?: boolean): Renderer {
  if (plain || !process.stdout.isTTY || !process.stdin.isTTY) {
    return new PlainTextRenderer()
  }

  return new InkRenderer({
    provider: config.provider,
    model: config.model,
    version: readVersion(),
    maxSteps: config.maxSteps,
  })
}

export async function runAgentCommand(
  message: string,
  config: CodelordConfig,
  options: { plain?: boolean } = {},
): Promise<void> {
  const renderer = createRenderer(config, options.plain)

  try {
    const model = resolveModel(config)
    const apiKey = await resolveApiKey(config)

    const cwd = process.cwd()
    const { tools, toolHandlers } = createToolKernel({ cwd, config })
    const systemPrompt = buildSystemPrompt({ cwd })

    await runAgent({
      model,
      systemPrompt,
      tools,
      toolHandlers,
      userMessage: message,
      apiKey,
      maxSteps: config.maxSteps,
      onEvent: (event) => renderer.onEvent(event),
    })
  } finally {
    renderer.cleanup()
  }
}
