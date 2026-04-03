import type { Api, Model } from '@mariozechner/pi-ai'
import { AgentRuntime } from '@agent/core'
import type { AgentEvent } from '@agent/core'
import type { CodelordConfig } from '@agent/config'
import { createToolKernel } from './tool-kernel.js'
import { buildSystemPrompt } from './system-prompt.js'
import { createRenderer } from './run.js'

// ---------------------------------------------------------------------------
// REPL — interactive shell with Ink as sole stdout owner
// ---------------------------------------------------------------------------

interface ReplOptions {
  model: Model<Api>
  apiKey: string
  config: CodelordConfig
}

export async function startRepl(options: ReplOptions): Promise<void> {
  const { model, apiKey, config } = options

  const cwd = process.cwd()
  const { tools, toolHandlers, contracts, router, safetyPolicy } = createToolKernel({ cwd, config })
  const systemPrompt = buildSystemPrompt({ cwd, contracts })

  const renderer = createRenderer(config)

  const runtime = new AgentRuntime({
    model,
    systemPrompt,
    tools,
    toolHandlers,
    apiKey,
    maxSteps: config.maxSteps,
    onEvent: (event: AgentEvent) => renderer.onEvent(event),
    onLifecycleEvent: (event) => renderer.onLifecycleEvent?.(event),
    router,
    safetyPolicy,
  })

  // --- Interrupt handling ---
  // When runtime is running, Ctrl+C requests interrupt.
  // When idle (waiting for input), Ctrl+C exits.
  let running = false

  process.on('SIGINT', () => {
    if (running) {
      runtime.requestInterrupt()
    } else {
      renderer.cleanup()
      process.exit(0)
    }
  })

  // --- Main REPL loop ---
  // All output goes through Ink. No direct terminal writes.
  while (true) {
    renderer.setRunning(false)
    const line = await renderer.waitForInput()

    // null means input closed (cleanup)
    if (line === null) break

    // Preserve original text for timeline; only trim for command detection
    const trimmed = line.trim()

    if (!trimmed) continue

    // --- Slash commands ---
    if (trimmed === '/exit') {
      break
    }

    // --- Inject input into runtime ---
    renderer.setRunning(true)

    if (runtime.pendingQuestion) {
      runtime.answerPendingQuestion(trimmed)
    } else {
      runtime.enqueueUserMessage(line)
    }

    // --- Drive runtime ---
    running = true
    try {
      await runtime.run()
    } catch {
      // Errors are already emitted as lifecycle events and rendered by Ink
    }
    running = false
  }

  renderer.cleanup()
}
