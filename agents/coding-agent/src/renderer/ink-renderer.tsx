// ---------------------------------------------------------------------------
// InkRenderer — React + Ink implementation driven by timeline projection
// ---------------------------------------------------------------------------

import React from 'react'
import { render } from 'ink'
import type { Instance } from 'ink'
import type { AgentEvent, LifecycleEvent } from '@agent/core'
import type { InteractiveRenderer, RuntimeQueueInfo } from './types.js'
import { App } from './ink/App.js'
import { TimelineStore } from './ink/timeline-store.js'
import { InputBridge } from './ink/input-bridge.js'
import type { TimelineSnapshot } from './ink/timeline-projection.js'

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
      <App
        store={this.store}
        inputBridge={this.inputBridge}
        version={config.version}
        provider={config.provider}
        model={config.model}
        maxSteps={config.maxSteps}
      />,
      { exitOnCtrlC: false },
    )

    if (this.inputBridge) {
      this.inputBridge.setActive(true)
    }
  }

  onEvent(event: AgentEvent): void { this.store.onRawEvent(event) }
  onLifecycleEvent(event: LifecycleEvent): void { this.store.onLifecycleEvent(event) }

  async waitForInput(): Promise<string | null> {
    if (!this.inputBridge) throw new Error('waitForInput requires interactive mode')
    return this.inputBridge.waitForInput()
  }

  setRunning(running: boolean, runtimeQueue?: RuntimeQueueInfo): void {
    this.inputBridge?.setRunning(running, runtimeQueue)
  }

  setQueueTarget(enqueue: (text: string) => void): void {
    this.inputBridge?.setQueueTarget(enqueue)
  }

  setInterruptHandler(handler: () => void): void {
    this.inputBridge?.setInterruptHandler(handler)
  }

  setExitHandler(handler: () => void): void {
    this.inputBridge?.setExitHandler(handler)
  }

  cleanup(): void {
    this.inputBridge?.close()
    if (this.inkInstance) {
      this.inkInstance.unmount()
      this.inkInstance = null
    }
  }

  captureTimelineSnapshot(): TimelineSnapshot { return this.store.captureSnapshot() }

  hydrateTimeline(snapshot: TimelineSnapshot): void {
    this.store.hydrateFromSnapshot(snapshot)
  }
}
