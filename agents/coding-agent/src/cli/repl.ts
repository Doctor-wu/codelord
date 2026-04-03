import type { Api, Model } from '@mariozechner/pi-ai'
import { AgentRuntime } from '@agent/core'
import type { AgentEvent } from '@agent/core'
import type { CodelordConfig } from '@agent/config'
import { createToolKernel } from './tool-kernel.js'
import { buildSystemPrompt } from './system-prompt.js'
import { createRenderer } from './run.js'
import { SessionStore } from '../session-store.js'

// ---------------------------------------------------------------------------
// REPL — interactive shell with Ink as sole stdout owner
// ---------------------------------------------------------------------------

interface ReplOptions {
  model: Model<Api>
  apiKey: string
  config: CodelordConfig
  forceNew?: boolean
}

export async function startRepl(options: ReplOptions): Promise<void> {
  const { model, apiKey, config, forceNew = false } = options

  const cwd = process.cwd()
  const { tools, toolHandlers, contracts, router, safetyPolicy } = createToolKernel({ cwd, config })
  const systemPrompt = buildSystemPrompt({ cwd, contracts })

  const renderer = createRenderer(config)
  const store = new SessionStore()

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

  // --- Session identity ---
  let sessionId: string
  let sessionCreatedAt: number

  // --- Try to resume previous session ---
  let resumed = false
  if (!forceNew) {
    const resumable = store.findResumable(cwd)
    if (resumable) {
      const snapshot = store.loadSnapshot(resumable.sessionId)
      if (snapshot) {
        const { wasDowngraded, interruptedDuring } = runtime.hydrateFromSnapshot(snapshot)
        sessionId = snapshot.sessionId
        sessionCreatedAt = snapshot.createdAt

        // Hydrate timeline for UI continuity
        const timeline = store.loadTimeline(resumable.sessionId)
        if (timeline) {
          renderer.hydrateTimeline(timeline)
        }

        // If state was downgraded from in-flight, emit a status event
        if (wasDowngraded && interruptedDuring) {
          renderer.onLifecycleEvent?.({
            type: 'blocked_enter',
            reason: 'interrupted',
            timestamp: Date.now(),
          })
        }

        resumed = true
      }
    }
  }

  if (!resumed) {
    sessionId = store.newSessionId()
    sessionCreatedAt = Date.now()
  }

  // --- Persistence helper ---
  const saveSession = () => {
    const snapshot = runtime.exportSnapshot({
      sessionId,
      cwd,
      provider: config.provider,
      model: config.model,
      createdAt: sessionCreatedAt,
    })
    const timeline = renderer.captureTimelineSnapshot()
    store.save(snapshot, timeline)
  }

  // Wire up queue: running-time submits go directly to runtime
  renderer.setQueueTarget((text: string) => {
    runtime.enqueueUserMessage(text)
    saveSession() // queue changed
  })

  // Helper: create queue info snapshot from runtime
  const queueInfo = () => ({
    pendingInboundCount: runtime.pendingInboundCount,
    pendingInboundPreviews: runtime.pendingInboundPreviews,
  })

  // --- Interrupt handling ---
  let running = false

  process.on('SIGINT', () => {
    if (running) {
      runtime.requestInterrupt()
    } else {
      saveSession() // save before exit
      renderer.cleanup()
      process.exit(0)
    }
  })

  // --- Main REPL loop ---
  while (true) {
    renderer.setRunning(false, queueInfo())
    const line = await renderer.waitForInput()

    if (line === null) break

    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed === '/exit') break

    // --- Inject input into runtime ---
    renderer.setRunning(true, queueInfo())

    if (runtime.pendingQuestion) {
      runtime.answerPendingQuestion(trimmed)
    } else {
      runtime.enqueueUserMessage(line)
    }

    saveSession() // input entered

    // --- Drive runtime ---
    running = true
    try {
      await runtime.run()
    } catch {
      // Errors are already emitted as lifecycle events
    }
    running = false

    saveSession() // burst completed

    // If runtime has pending inbound (queued during this run), re-run
    while (runtime.pendingInboundCount > 0) {
      renderer.setRunning(true, queueInfo())
      running = true
      try {
        await runtime.run()
      } catch {
        // handled by lifecycle events
      }
      running = false
      saveSession() // burst completed
    }
  }

  saveSession() // save on clean exit
  renderer.cleanup()
}
