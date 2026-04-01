import { readFileSync } from 'node:fs'
import { getModels } from '@mariozechner/pi-ai'
import type { Api, Model } from '@mariozechner/pi-ai'
import { bashTool, createBashToolHandler, runAgent } from '@agent/core'
import type { CodelordConfig } from '@agent/config'
import { resolveApiKey } from '../auth/index.js'
import { InkRenderer, PlainTextRenderer } from '../renderer/index.js'
import type { Renderer } from '../renderer/index.js'

const SYSTEM_PROMPT = `You are a coding agent. You can execute bash commands to explore codebases, read files, run tests, and help debug issues.

When investigating code:
1. Start by understanding the project structure (ls, find, cat package.json)
2. Read relevant files to understand the code
3. If asked to fix something, explain what you found and suggest changes

Always explain your reasoning before executing commands.`

function readVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
  ) as { version: string }
  return packageJson.version
}

function resolveModel(config: CodelordConfig): Model<Api> {
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

    const toolHandlers = new Map([
      [
        'bash',
        createBashToolHandler({
          cwd: process.cwd(),
          timeout: config.bash.timeout,
          maxOutput: config.bash.maxOutput,
        }),
      ],
    ])

    await runAgent({
      model,
      systemPrompt: SYSTEM_PROMPT,
      tools: [bashTool],
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
