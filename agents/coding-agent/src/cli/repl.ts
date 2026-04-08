import type { Api, Model } from '@mariozechner/pi-ai'
import { AgentRuntime } from '@agent/core'
import type { AgentEvent, LifecycleEvent, ReasoningLevel } from '@agent/core'
import type { CodelordConfig } from '@agent/config'
import { estimateTokens, DEFAULT_CONTEXT_WINDOW } from '@agent/core'
import type { ContextWindowConfig } from '@agent/core'
import { createToolKernel } from './tool-kernel.js'
import { buildSystemPrompt } from './system-prompt.js'
import { createRenderer } from './run.js'
import { isRegisteredCommand, formatHelpText } from './commands.js'
import { SessionStore } from '../session-store.js'
import { CheckpointManager } from '../checkpoint-manager.js'
import { TraceRecorder } from '../trace-recorder.js'
import { TraceStore, workspaceSlug, workspaceId } from '../trace-store.js'
import { reconcileTimelineForResume } from '../renderer/ink/timeline-projection.js'
import { getGitBranch } from './git-utils.js'

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

  // Context window config
  const contextWindowConfig: ContextWindowConfig = {
    maxTokens: config.contextWindow?.maxTokens ?? DEFAULT_CONTEXT_WINDOW.maxTokens,
    reservedOutputTokens: config.contextWindow?.reservedOutputTokens ?? DEFAULT_CONTEXT_WINDOW.reservedOutputTokens,
  }

  // System prompt token baseline
  const spTokens = estimateTokens(systemPrompt)
  const spPct = ((spTokens / contextWindowConfig.maxTokens) * 100).toFixed(1)
  process.stderr.write(`System prompt: ~${spTokens} tokens (${spPct}% of ${contextWindowConfig.maxTokens})\n`)

  const renderer = createRenderer(config)
  const store = new SessionStore()

  // --- Session identity ---
  let sessionId: string
  let sessionCreatedAt: number
  let checkpointManager: CheckpointManager
  const gitBranch = getGitBranch(cwd)

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

  // --- Trace infrastructure ---
  const traceStore = new TraceStore()
  const wsSlug = workspaceSlug(cwd)
  const wsId = workspaceId(cwd)
  let activeRecorder: TraceRecorder | null = null

  const newRecorder = () => new TraceRecorder({
    sessionId, cwd, workspaceRoot: cwd, workspaceSlug: wsSlug, workspaceId: wsId,
    provider: config.provider, model: config.model, systemPrompt,
  })

  // Fan-out lifecycle events to renderer + active trace recorder
  const fanOutLifecycle = (event: LifecycleEvent) => {
    renderer.onLifecycleEvent?.(event)
    activeRecorder?.onLifecycleEvent(event)
    // When queue is drained inside runtime, push fresh queue info to UI immediately
    if (event.type === 'queue_drained') {
      renderer.setRunning(true, queueInfo())
    }
  }

  const runtime = new AgentRuntime({
    model,
    systemPrompt,
    tools,
    toolHandlers: wrappedHandlers,
    apiKey,
    maxSteps: config.maxSteps,
    reasoningLevel: config.reasoningLevel,
    onEvent: (event: AgentEvent) => {
      renderer.onEvent(event)
      activeRecorder?.onAgentEvent(event)
    },
    onLifecycleEvent: fanOutLifecycle,
    onProviderStreamEvent: (event) => activeRecorder?.onProviderStreamEvent(event),
    router,
    safetyPolicy,
    sessionId,
    contextWindow: contextWindowConfig,
  })

  // If resuming, hydrate runtime state and reconcile timeline
  if (resumeSessionId) {
    const snapshot = store.loadSnapshot(resumeSessionId)
    if (snapshot) {
      const { wasDowngraded, interruptedDuring } = runtime.hydrateFromSnapshot(snapshot)

      // Reconcile timeline: runtime snapshot is truth, timeline is UI cache
      const timelineCache = store.loadTimeline(resumeSessionId)
      const reconciledTimeline = reconcileTimelineForResume(timelineCache, {
        snapshot,
        wasDowngraded,
        interruptedDuring,
      })
      renderer.hydrateTimeline({
        items: reconciledTimeline.items,
        startTime: reconciledTimeline.startTime,
        _nextId: reconciledTimeline._nextId,
        usage: reconciledTimeline.usage,
        stepCount: reconciledTimeline.stepCount,
      })

      // Push queue info to renderer immediately so pending queue is visible on resume
      renderer.setRunning(false, {
        pendingInboundCount: runtime.pendingInboundCount,
        pendingInboundPreviews: runtime.pendingInboundPreviews,
      })
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
      gitBranch,
    })
    const timeline = renderer.captureTimelineSnapshot()
    store.save(snapshot, timeline)
  }

  // Wire up queue: running-time submits go directly to runtime
  renderer.setQueueTarget((text: string) => {
    runtime.enqueueUserMessage(text)
    // Push updated queue info back to renderer so UI reflects the new queue state
    renderer.setRunning(true, queueInfo())
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

  // Escape — interrupt running agent (no-op when idle)
  renderer.setInterruptHandler(() => {
    if (running) {
      activeRecorder?.recordInterruptRequest()
      runtime.requestInterrupt()
    }
  })

  // Ctrl+C — interrupt when running, graceful exit when idle
  renderer.setExitHandler(() => {
    if (running) {
      activeRecorder?.recordInterruptRequest()
      runtime.requestInterrupt()
    } else {
      saveSession()
      renderer.cleanup()
      printResumeHint()
      process.exit(0)
    }
  })

  // Ctrl+C fallback — graceful exit when idle, interrupt when running
  process.on('SIGINT', () => {
    if (running) {
      activeRecorder?.recordInterruptRequest()
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
        type: 'command_feedback',
        success: false,
        message: 'Nothing to undo — no checkpoints available.',
        timestamp: Date.now(),
      })
      return true
    }

    const last = checkpointManager.stack[checkpointManager.stack.length - 1]
    if (!last.canUndo) {
      renderer.onLifecycleEvent?.({
        type: 'command_feedback',
        success: false,
        message: `Cannot undo: ${last.limitations.join('; ') || 'checkpoint marked as non-reversible'}.`,
        timestamp: Date.now(),
      })
      return true
    }

    const result = checkpointManager.undo()
    if (!result) return true

    fanOutLifecycle({
      type: 'checkpoint_undone',
      checkpointId: result.record.checkpointId,
      restoredFileCount: result.restoredFiles.length,
      gitRestored: result.gitRestored,
      timestamp: Date.now(),
    })

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

    // --- Control commands (registered in command registry) ---
    if (isRegisteredCommand(trimmed)) {
      if (trimmed === '/help') {
        renderer.onLifecycleEvent?.({
          type: 'command_feedback',
          success: true,
          message: formatHelpText('idle', running),
          timestamp: Date.now(),
        })
        continue
      }

      if (trimmed === '/undo') {
        if (running) {
          renderer.onLifecycleEvent?.({
            type: 'command_feedback',
            success: false,
            message: 'Cannot /undo while agent is running. Press Ctrl+C to interrupt first.',
            timestamp: Date.now(),
          })
          continue
        }
        handleUndo()
        continue
      }

      if (trimmed === '/reasoning' || trimmed.startsWith('/reasoning ')) {
        const VALID_LEVELS: ReasoningLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh']
        const arg = trimmed.slice('/reasoning'.length).trim()
        if (!arg) {
          renderer.onLifecycleEvent?.({
            type: 'command_feedback',
            success: true,
            message: `Reasoning level: ${runtime.reasoningLevel}`,
            timestamp: Date.now(),
          })
        } else if (VALID_LEVELS.includes(arg as ReasoningLevel)) {
          runtime.setReasoningLevel(arg as ReasoningLevel)
          renderer.setReasoningLevel(arg)
          renderer.onLifecycleEvent?.({
            type: 'command_feedback',
            success: true,
            message: `Reasoning level → ${arg}`,
            timestamp: Date.now(),
          })
        } else {
          renderer.onLifecycleEvent?.({
            type: 'command_feedback',
            success: false,
            message: `Invalid reasoning level "${arg}". Valid: ${VALID_LEVELS.join(', ')}`,
            timestamp: Date.now(),
          })
        }
        continue
      }

      continue // registered but unhandled — skip
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
    activeRecorder = newRecorder()
    checkpointManager.beginBurst()
    running = true
    let outcome: import('@agent/core').RunOutcome
    try {
      outcome = await runtime.run()
    } catch {
      outcome = { type: 'error', error: 'Unhandled runtime error' }
    }
    running = false
    const checkpoint = checkpointManager.endBurst()
    if (checkpoint) {
      fanOutLifecycle({
        type: 'checkpoint_created',
        checkpointId: checkpoint.checkpointId,
        strategy: checkpoint.strategy,
        fileCount: checkpoint.files.length,
        hasGit: checkpoint.git !== null,
        timestamp: Date.now(),
      })
    }

    // Lightweight interrupt feedback
    if (outcome.type === 'interrupted') {
      renderer.onLifecycleEvent?.({
        type: 'command_feedback',
        success: true,
        message: '⏸ Interrupted — ready for your next input',
        timestamp: Date.now(),
      })
    }

    // Finalize and persist trace
    try { traceStore.save(activeRecorder.finalize(outcome, { toolStats: runtime.toolStats.exportSnapshot() })) } catch { /* best effort */ }
    activeRecorder = null

    saveSession()

  }

  saveSession()
  renderer.cleanup()
  printResumeHint()
  process.exit(0)
}
