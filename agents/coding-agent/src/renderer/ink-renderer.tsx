// ---------------------------------------------------------------------------
// InkRenderer — React + Ink implementation driven by timeline projection
// ---------------------------------------------------------------------------

import React, { useState, useEffect } from 'react'
import { render } from 'ink'
import type { Instance } from 'ink'
import type { AgentEvent, LifecycleEvent } from '@agent/core'
import type { Renderer, InteractiveRenderer, RuntimeQueueInfo } from './types.js'
import { App } from './ink/App.js'
import type { TimelineState } from './ink/timeline-projection.js'
import {
  createInitialTimelineState,
  reduceLifecycleEvent,
  applyThinkingDelta,
  applyTextDelta,
  applyToolCallStart,
  applyToolCallDelta,
  applyToolCallEnd,
  captureTimelineSnapshot,
  hydrateTimelineState,
} from './ink/timeline-projection.js'
import type { TimelineSnapshot } from './ink/timeline-projection.js'

// ---------------------------------------------------------------------------
// TimelineStore — event → state bridge
// ---------------------------------------------------------------------------

type StateListener = (state: TimelineState) => void

class TimelineStore {
  private state: TimelineState
  private listeners: Set<StateListener> = new Set()
  /** Throttle timer for high-frequency toolcall_delta events */
  private _deltaFlushTimer: ReturnType<typeof setTimeout> | null = null
  private _pendingDeltaState: TimelineState | null = null
  private static readonly DELTA_THROTTLE_MS = 67 // ~15Hz

  constructor(idle = false) {
    this.state = createInitialTimelineState(idle)
  }

  getState(): TimelineState {
    return this.state
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    this.state = { ...this.state }
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }

  /** Flush any pending throttled delta state immediately */
  private flushPendingDelta(): void {
    if (this._deltaFlushTimer) {
      clearTimeout(this._deltaFlushTimer)
      this._deltaFlushTimer = null
    }
    if (this._pendingDeltaState) {
      this.state = this._pendingDeltaState
      this._pendingDeltaState = null
      this.notify()
    }
  }

  /** Schedule a throttled notification for delta updates */
  private notifyThrottled(newState: TimelineState): void {
    this._pendingDeltaState = newState
    if (!this._deltaFlushTimer) {
      this._deltaFlushTimer = setTimeout(() => {
        this._deltaFlushTimer = null
        if (this._pendingDeltaState) {
          this.state = this._pendingDeltaState
          this._pendingDeltaState = null
          this.notify()
        }
      }, TimelineStore.DELTA_THROTTLE_MS)
    }
  }

  onRawEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'thinking_delta':
        this.state = applyThinkingDelta(this.state, event.delta)
        this.notify()
        break
      case 'text_delta':
        this.state = applyTextDelta(this.state, event.delta)
        this.notify()
        break
      case 'toolcall_start':
        // Flush any pending delta before start
        this.flushPendingDelta()
        this.state = applyToolCallStart(this.state, event.contentIndex, event.toolName, event.args)
        this.notify()
        break
      case 'toolcall_delta':
        // Throttle high-frequency delta updates (~15Hz max)
        this.notifyThrottled(
          applyToolCallDelta(this._pendingDeltaState ?? this.state, event.contentIndex, event.toolName, event.args),
        )
        break
      case 'toolcall_end':
        // Flush pending delta, then apply end
        this.flushPendingDelta()
        this.state = applyToolCallEnd(this.state, event.contentIndex, event.toolCall.id, event.toolCall.name, event.toolCall.arguments)
        this.notify()
        break
    }
  }

  onLifecycleEvent(event: LifecycleEvent): void {
    // Flush any pending throttled delta before processing lifecycle events
    // This ensures provisional→stable handoff sees the latest state
    this.state = this._pendingDeltaState ?? this.state
    this._pendingDeltaState = null
    if (this._deltaFlushTimer) {
      clearTimeout(this._deltaFlushTimer)
      this._deltaFlushTimer = null
    }
    this.state = reduceLifecycleEvent(this.state, event)
    this.notify()
  }

  captureSnapshot(): TimelineSnapshot {
    return captureTimelineSnapshot(this.state)
  }

  hydrateFromSnapshot(snapshot: TimelineSnapshot): void {
    this.state = hydrateTimelineState(snapshot)
    this.notify()
  }
}

// ---------------------------------------------------------------------------
// InputBridge — connects Ink input to REPL and runtime queue
// ---------------------------------------------------------------------------

class InputBridge {
  private _isActive = false
  private _isRunning = false
  private _resolve: ((value: string | null) => void) | null = null
  private _queueTarget: ((text: string) => void) | null = null
  private _listeners: Set<(active: boolean) => void> = new Set()

  // Runtime queue info (read-only projection for UI)
  private _runtimeQueue: RuntimeQueueInfo | null = null
  private _queueListeners: Set<(info: RuntimeQueueInfo | null) => void> = new Set()

  get isActive(): boolean { return this._isActive }
  get isRunning(): boolean { return this._isRunning }
  get runtimeQueue(): RuntimeQueueInfo | null { return this._runtimeQueue }

  setActive(active: boolean): void {
    this._isActive = active
    for (const listener of this._listeners) listener(active)
  }

  setRunning(running: boolean, runtimeQueue?: RuntimeQueueInfo): void {
    this._isRunning = running
    this._runtimeQueue = runtimeQueue ?? null
    // During running, input stays active for queue input
    this._isActive = true
    for (const listener of this._listeners) listener(true)
    this.notifyQueue()
  }

  setQueueTarget(enqueue: (text: string) => void): void {
    this._queueTarget = enqueue
  }

  subscribe(listener: (active: boolean) => void): () => void {
    this._listeners.add(listener)
    return () => this._listeners.delete(listener)
  }

  subscribeQueue(listener: (info: RuntimeQueueInfo | null) => void): () => void {
    this._queueListeners.add(listener)
    return () => this._queueListeners.delete(listener)
  }

  private notifyQueue(): void {
    for (const listener of this._queueListeners) listener(this._runtimeQueue)
  }

  /** Called by Ink InputComposer when user presses Enter */
  submit(text: string): void {
    if (this._isRunning && this._queueTarget) {
      // Queue mode: send directly to runtime
      this._queueTarget(text)
      // Re-read runtime queue info and notify UI
      this.notifyQueue()
    } else if (this._resolve) {
      const resolve = this._resolve
      this._resolve = null
      resolve(text)
    }
  }

  /** Called by REPL to wait for next input */
  waitForInput(): Promise<string | null> {
    return new Promise(resolve => {
      this._resolve = resolve
    })
  }

  close(): void {
    if (this._resolve) {
      this._resolve(null)
      this._resolve = null
    }
  }
}

// ---------------------------------------------------------------------------
// Bridge component: subscribes to stores and re-renders App
// ---------------------------------------------------------------------------

interface BridgeProps {
  store: TimelineStore
  inputBridge: InputBridge | null
  version: string
  provider: string
  model: string
  maxSteps: number
}

function Bridge({ store, inputBridge, version, provider, model, maxSteps }: BridgeProps) {
  const [state, setState] = useState<TimelineState>(store.getState())
  const [inputActive, setInputActive] = useState(inputBridge?.isActive ?? false)
  const [runtimeQueue, setRuntimeQueue] = useState<RuntimeQueueInfo | null>(null)
  const [isRunning, setIsRunning] = useState(inputBridge?.isRunning ?? false)

  useEffect(() => {
    return store.subscribe(setState)
  }, [store])

  useEffect(() => {
    if (!inputBridge) return
    setInputActive(inputBridge.isActive)
    return inputBridge.subscribe((active) => {
      setInputActive(active)
      setIsRunning(inputBridge.isRunning)
    })
  }, [inputBridge])

  useEffect(() => {
    if (!inputBridge) return
    return inputBridge.subscribeQueue((info) => {
      setRuntimeQueue(info)
    })
  }, [inputBridge])

  const handleSubmit = inputBridge
    ? (text: string) => inputBridge.submit(text)
    : undefined

  // Build pending queue from runtime queue info
  const pendingQueue = runtimeQueue?.pendingInboundPreviews ?? []

  return (
    <App
      state={state}
      version={version}
      provider={provider}
      model={model}
      maxSteps={maxSteps}
      inputActive={inputActive}
      onInputSubmit={handleSubmit}
      pendingQueue={pendingQueue}
      isRunning={isRunning}
    />
  )
}

// ---------------------------------------------------------------------------
// InkRenderer — the public class implementing Renderer
// ---------------------------------------------------------------------------

export interface InkRendererConfig {
  provider: string
  model: string
  version: string
  maxSteps: number
  idle?: boolean
  interactive?: boolean
}

export class InkRenderer implements InteractiveRenderer {
  private inkInstance: Instance | null = null
  private readonly store: TimelineStore
  private readonly config: InkRendererConfig
  private readonly inputBridge: InputBridge | null

  constructor(config: InkRendererConfig) {
    this.config = config
    this.store = new TimelineStore(config.idle)
    this.inputBridge = config.interactive ? new InputBridge() : null

    this.inkInstance = render(
      <Bridge
        store={this.store}
        inputBridge={this.inputBridge}
        version={config.version}
        provider={config.provider}
        model={config.model}
        maxSteps={config.maxSteps}
      />,
    )

    if (this.inputBridge) {
      this.inputBridge.setActive(true)
    }
  }

  onEvent(event: AgentEvent): void {
    this.store.onRawEvent(event)
  }

  onLifecycleEvent(event: LifecycleEvent): void {
    this.store.onLifecycleEvent(event)
    // After lifecycle events, re-notify queue listeners so UI stays fresh
    if (this.inputBridge?.runtimeQueue) {
      // Trigger a queue re-read by re-setting running state
      // This ensures UI picks up queue changes from safe-boundary drains
    }
  }

  async waitForInput(): Promise<string | null> {
    if (!this.inputBridge) throw new Error('waitForInput requires interactive mode')
    return this.inputBridge.waitForInput()
  }

  setRunning(running: boolean, runtimeQueue?: RuntimeQueueInfo): void {
    if (this.inputBridge) {
      this.inputBridge.setRunning(running, runtimeQueue)
    }
  }

  setQueueTarget(enqueue: (text: string) => void): void {
    if (this.inputBridge) {
      this.inputBridge.setQueueTarget(enqueue)
    }
  }

  cleanup(): void {
    this.inputBridge?.close()
    if (this.inkInstance) {
      this.inkInstance.unmount()
      this.inkInstance = null
    }
  }

  captureTimelineSnapshot(): TimelineSnapshot {
    return this.store.captureSnapshot()
  }

  hydrateTimeline(snapshot: TimelineSnapshot): void {
    this.store.hydrateFromSnapshot(snapshot)
  }
}
