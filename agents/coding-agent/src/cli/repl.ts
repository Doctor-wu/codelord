import type { Api, Model } from '@mariozechner/pi-ai'
import { AgentRuntime } from '@agent/core'
import type { AgentEvent } from '@agent/core'
import type { CodelordConfig } from '@agent/config'
import { createToolKernel } from './tool-kernel.js'
import { buildSystemPrompt } from './system-prompt.js'
import { createRenderer } from './run.js'
import { SessionStore } from '../session-store.js'
import { CheckpointManager } from '../checkpoint-manager.js'

// ---------------------------------------------------------------------------
// REPL — interactive shell with Ink as sole stdout owner
// ---------------------------------------------------------------------------

interface ReplOptions {
  model: Model<Api>
  apiKey: string
  config: CodelordConfig
  /** If set, resume this specific session instead of creating a new one */
  resumeSessionId?: string
}

export async function startRepl(options: ReplOptions): Promise<void> {
  const { model, apiKey, config, resumeSessionId } = options

  const cwd = process.cwd()
  const { tools, toolHandlers, contracts, router, safetyPolicy } = createToolKernel({ cwd, config })
  const systemPrompt = buildSystemPrompt({ cwd, contracts })

  const renderer = createRenderer(config)
  const store = new SessionStore()

  // --- Session identity ---
  let sessionId: string
  let sessionCreatedAt: number
  let checkpointManager: CheckpointManager

  // --- Resume or new ---
  if (resumeSessionId) {
    const snapshot = store.loadSnapshot(resumeSessionId)
    if (snapshot) {
      sessionId = snapshot.sessionId
      sessionCreatedAt = snapshot.createdAt
      checkpointManager = new CheckpointManager({
        cwd,
        sessionId,
        stack: snapshot.checkpoints,
      })
    } else {
      sessionId = store.newSessionId()
      sessionCreatedAt = Date.now()
      checkpointManager = new CheckpointManager({ cwd, sessionId })
    }
  } else {
    sessionId = store.newSessionId()
    sessionCreatedAt = Date.now()
    checkpointManager = new CheckpointManager({ cwd, sessionId })
  }

  // Wrap mutating handlers with checkpoint protection
  const wrappedHandlers = checkpointManager.wrapHandlers(toolHandlers)

  const runtime = new AgentRuntime({
    model,
    systemPrompt,
    tools,
    toolHandlers: wrappedHandlers,
    apiKey,
    maxSteps: config.maxSteps,
    onEvent: (event: AgentEvent) => renderer.onEvent(event),
    onLifecycleEvent: (event) => renderer.onLifecycleEvent?.(event),
    router,
    safetyPolicy,
  })

  // If resuming, hydrate runtime state
  if (resumeSessionId) {
    const snapshot = store.loadSnapshot(resumeSessionId)
    if (snapshot) {
      const { wasDowngraded, interruptedDuring } = runtime.hydrateFromSnapshot(snapshot)

      const timeline = store.loadTimeline(resumeSessionId)
      if (timeline) {
        renderer.hydrateTimeline(timeline)
      }

      if (wasDowngraded && interruptedDuring) {
        renderer.onLifecycleEvent?.({
          type: 'blocked_enter',
          reason: 'interrupted',
          timestamp: Date.now(),
        })
      }
    }
  }

  // --- Persistence helper ---
  const saveSession = () => {
    const snapshot = runtime.exportSnapshot({
      sessionId,
      cwd,
      provider: config.provider,
      model: config.model,
      createdAt: sessionCreatedAt,
      checkpoints: [...checkpointManager.stack],
    })
    const timeline = renderer.captureTimelineSnapshot()
    store.save(snapshot, timeline)
  }

  // Wire up queue: running-time submits go directly to runtime
  renderer.setQueueTarget((text: string) => {
    runtime.enqueueUserMessage(text)
    saveSession()
  })

  // Helper: create queue info snapshot from runtime
  const queueInfo = () => ({
    pendingInboundCount: runtime.pendingInboundCount,
    pendingInboundPreviews: runtime.pendingInboundPreviews,
  })

  // --- Interrupt handling ---
  let running = false

  const printResumeHint = () => {
    if (runtime.messages.length > 0) {
      process.stderr.write(`\nTo resume this session:\n  codelord --resume ${sessionId}\n`)
    }
  }

  process.on('SIGINT', () => {
    if (running) {
      runtime.requestInterrupt()
    } else {
      saveSession()
      renderer.cleanup()
      printResumeHint()
      process.exit(0)
    }
  })

  // --- /undo handler ---
  const handleUndo = (): boolean => {
    if (checkpointManager.undoCount === 0) {
      renderer.onLifecycleEvent?.({
        type: 'session_done',
        success: false,
        error: 'Nothing to undo — no checkpoints available.',
        timestamp: Date.now(),
      })
      return true
    }

    const last = checkpointManager.stack[checkpointManager.stack.length - 1]
    if (!last.canUndo) {
      renderer.onLifecycleEvent?.({
        type: 'session_done',
        success: false,
        error: `Cannot undo: ${last.limitations.join('; ') || 'checkpoint marked as non-reversible'}.`,
        timestamp: Date.now(),
      })
      return true
    }

    const result = checkpointManager.undo()
    if (!result) return true

    const fileList = result.restoredFiles.map(f => `  - ${f}`).join('\n')
    const undoMessage = `[UNDO] Reverted ${result.restoredFiles.length} file(s) from checkpoint ${result.record.checkpointId.slice(0, 8)}:\n${fileList}\n\nThe file changes from the previous agent turn have been undone. The files listed above have been restored to their state before that turn.`

    // Push directly into message history (not queue) so the agent sees it
    // on the next turn, but we don't trigger a run or leave orphaned queue items.
    runtime.messages.push({ role: 'user', content: undoMessage, timestamp: Date.now() })
    renderer.onLifecycleEvent?.({
      type: 'user_turn',
      id: `undo-${Date.now()}`,
      content: undoMessage,
      timestamp: Date.now(),
    })
    // Signal timeline that the undo action is complete — back to idle
    renderer.onLifecycleEvent?.({
      type: 'session_done',
      success: true,
      text: undoMessage,
      timestamp: Date.now(),
    })

    saveSession()
    return true
  }

  // --- Main REPL loop ---
  while (true) {
    renderer.setRunning(false, queueInfo())
    const line = await renderer.waitForInput()

    if (line === null) break

    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed === '/exit') break

    // --- Control commands (not queued, not sent to runtime) ---
    if (trimmed === '/undo') {
      if (running) {
        renderer.onLifecycleEvent?.({
          type: 'session_done',
          success: false,
          error: 'Cannot /undo while agent is running. Press Ctrl+C to interrupt first.',
          timestamp: Date.now(),
        })
        continue
      }
      handleUndo()
      continue
    }

    // --- Inject input into runtime ---
    renderer.setRunning(true, queueInfo())

    if (runtime.pendingQuestion) {
      runtime.answerPendingQuestion(trimmed)
    } else {
      runtime.enqueueUserMessage(line)
    }

    saveSession()

    // --- Drive runtime ---
    checkpointManager.beginBurst()
    running = true
    try {
      await runtime.run()
    } catch {
      // Errors are already emitted as lifecycle events
    }
    running = false
    checkpointManager.endBurst()

    saveSession()

    // If runtime has pending inbound (queued during this run), re-run
    while (runtime.pendingInboundCount > 0) {
      renderer.setRunning(true, queueInfo())
      checkpointManager.beginBurst()
      running = true
      try {
        await runtime.run()
      } catch {
        // handled by lifecycle events
      }
      running = false
      checkpointManager.endBurst()
      saveSession()
    }
  }

  saveSession()
  renderer.cleanup()
  printResumeHint()
}
