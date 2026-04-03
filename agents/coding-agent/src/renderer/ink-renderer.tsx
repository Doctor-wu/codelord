// ---------------------------------------------------------------------------
// InkRenderer — React + Ink implementation driven by timeline projection
// ---------------------------------------------------------------------------

import React, { useState, useEffect } from 'react'
import { render } from 'ink'
import type { Instance } from 'ink'
import type { AgentEvent, LifecycleEvent } from '@agent/core'
import type { Renderer, InteractiveRenderer } from './types.js'
import { App } from './ink/App.js'
import type { TimelineState } from './ink/timeline-projection.js'
import {
  createInitialTimelineState,
  reduceLifecycleEvent,
  applyThinkingDelta,
  applyTextDelta,
} from './ink/timeline-projection.js'

// ---------------------------------------------------------------------------
// Event emitter bridge: InkRenderer pushes state, React component subscribes
// ---------------------------------------------------------------------------

type StateListener = (state: TimelineState) => void

class TimelineStore {
  private state: TimelineState
  private listeners: Set<StateListener> = new Set()

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

  // --- Raw stream events (high-frequency deltas) ---

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
      // Other raw events are handled via lifecycle or ignored
    }
  }

  // --- Lifecycle events (stable semantic events) ---

  onLifecycleEvent(event: LifecycleEvent): void {
    this.state = reduceLifecycleEvent(this.state, event)
    this.notify()
  }
}

// ---------------------------------------------------------------------------
// Input state bridge: REPL waits for input, Ink component submits it
// ---------------------------------------------------------------------------

class InputBridge {
  private _isActive = false
  private _resolve: ((value: string | null) => void) | null = null
  private _listeners: Set<(active: boolean) => void> = new Set()

  get isActive(): boolean { return this._isActive }

  setActive(active: boolean): void {
    this._isActive = active
    for (const listener of this._listeners) listener(active)
  }

  subscribe(listener: (active: boolean) => void): () => void {
    this._listeners.add(listener)
    return () => this._listeners.delete(listener)
  }

  /** Called by the Ink InputComposer when user presses Enter */
  submit(text: string): void {
    if (this._resolve) {
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

  /** Called on cleanup to unblock any pending wait */
  close(): void {
    if (this._resolve) {
      this._resolve(null)
      this._resolve = null
    }
  }
}

// ---------------------------------------------------------------------------
// Bridge component: subscribes to TimelineStore and re-renders App
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

  useEffect(() => {
    return store.subscribe(setState)
  }, [store])

  useEffect(() => {
    if (!inputBridge) return
    setInputActive(inputBridge.isActive)
    return inputBridge.subscribe(setInputActive)
  }, [inputBridge])

  const handleSubmit = inputBridge
    ? (text: string) => inputBridge.submit(text)
    : undefined

  return (
    <App
      state={state}
      version={version}
      provider={provider}
      model={model}
      maxSteps={maxSteps}
      inputActive={inputActive}
      onInputSubmit={handleSubmit}
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
  /** Start in idle state (no thinking spinner). Use for REPL mode. */
  idle?: boolean
  /** Enable interactive input (REPL mode). */
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

    // Mount Ink
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

    // If interactive, start with input active
    if (this.inputBridge) {
      this.inputBridge.setActive(true)
    }
  }

  onEvent(event: AgentEvent): void {
    // Raw stream events go directly to the store for delta processing
    this.store.onRawEvent(event)
  }

  onLifecycleEvent(event: LifecycleEvent): void {
    this.store.onLifecycleEvent(event)
  }

  // --- InteractiveRenderer ---

  async waitForInput(): Promise<string | null> {
    if (!this.inputBridge) throw new Error('waitForInput requires interactive mode')
    return this.inputBridge.waitForInput()
  }

  setRunning(running: boolean): void {
    if (this.inputBridge) {
      this.inputBridge.setActive(!running)
    }
  }

  cleanup(): void {
    this.inputBridge?.close()
    if (this.inkInstance) {
      this.inkInstance.unmount()
      this.inkInstance = null
    }
  }
}
