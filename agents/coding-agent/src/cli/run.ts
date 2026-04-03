import { readFileSync } from 'node:fs'
import { getModels } from '@mariozechner/pi-ai'
import type { Api, Model } from '@mariozechner/pi-ai'
import type { CodelordConfig } from '@agent/config'
import { InkRenderer } from '../renderer/index.js'
import type { InteractiveRenderer } from '../renderer/index.js'

export function readVersion(): string {
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

export function createRenderer(config: CodelordConfig): InteractiveRenderer {
  return new InkRenderer({
    provider: config.provider,
    model: config.model,
    version: readVersion(),
    maxSteps: config.maxSteps,
    idle: true,
    interactive: true,
  })
}
