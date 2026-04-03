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
  while (true) {
    renderer.setRunning(false)
    const line = await renderer.waitForInput()

    if (line === null) break

    const trimmed = line.trim()
    if (!trimmed) continue

    if (trimmed === '/exit') break

    // --- Inject input into runtime ---
    renderer.setRunning(true)

    if (runtime.pendingQuestion) {
      runtime.answerPendingQuestion(trimmed)
    } else {
      runtime.enqueueUserMessage(line)
    }

    // --- Drive runtime, then drain any queued messages ---
    running = true
    try {
      await runtime.run()
    } catch {
      // Errors are already emitted as lifecycle events
    }
    running = false

    // --- Drain queue: enqueue all pending messages at once, then run once ---
    let queued = renderer.drainQueue()
    while (queued.length > 0) {
      let shouldExit = false
      for (const msg of queued) {
        const qTrimmed = msg.trim()
        if (!qTrimmed) continue
        if (qTrimmed === '/exit') { shouldExit = true; break }
        runtime.enqueueUserMessage(msg)
      }
      if (shouldExit) { renderer.cleanup(); return }

      renderer.setRunning(true)
      running = true
      try {
        await runtime.run()
      } catch {
        // handled by lifecycle events
      }
      running = false

      // Check if more messages arrived during this run
      queued = renderer.drainQueue()
    }
  }

  renderer.cleanup()
}
