// ---------------------------------------------------------------------------
// InkRenderer — React + Ink implementation of the Renderer interface
// ---------------------------------------------------------------------------

import React, { useState, useEffect } from 'react'
import { render } from 'ink'
import type { Instance } from 'ink'
import type { AgentEvent } from '@agent/core'
import type { Renderer } from './types.js'
import { App } from './ink/App.js'
import type { AppState, StepState, ToolCallState } from './ink/state.js'
import { createInitialState } from './ink/state.js'
import { classifyCommand, classifyToolName } from './ink/classify.js'
import type { StepCategory } from './ink/theme.js'

// ---------------------------------------------------------------------------
// Event emitter bridge: InkRenderer pushes events, React component subscribes
// ---------------------------------------------------------------------------

type StateListener = (state: AppState) => void

class StateStore {
  private state: AppState
  private listeners: Set<StateListener> = new Set()

  constructor(maxSteps: number) {
    this.state = createInitialState(maxSteps)
  }

  getState(): AppState {
    return this.state
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    // Shallow clone to trigger React re-render
    this.state = { ...this.state }
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }

  // --- State mutation methods ---

  stepStart(step: number): void {
    // Complete current step and push to history
    if (this.state.currentStep) {
      this.state.currentStep.isComplete = true
      this.state.steps = [...this.state.steps, this.state.currentStep]
    }

    this.state.currentStep = {
      step,
      category: 'read',
      thought: '',
      toolCalls: [],
      isComplete: false,
    }
    this.emit()
  }

  textDelta(delta: string): void {
    if (!this.state.currentStep) return
    this.state.currentStep = {
      ...this.state.currentStep,
      thought: this.state.currentStep.thought + delta,
    }
    this.emit()
  }

  textEnd(_text: string): void {
    // thought is already accumulated via textDelta — nothing extra needed
    this.emit()
  }

  toolCallEnd(toolName: string, args: Record<string, unknown>): void {
    if (!this.state.currentStep) return

    const command = typeof args.command === 'string'
      ? args.command
      : toolName

    const toolCall: ToolCallState = {
      name: toolName,
      args,
      command,
      isError: false,
      startTime: Date.now(),
    }

    this.state.currentStep = {
      ...this.state.currentStep,
      toolCalls: [...this.state.currentStep.toolCalls, toolCall],
    }

    // Classify step based on tool call
    const category: StepCategory = toolName === 'bash'
      ? classifyCommand(command)
      : classifyToolName(toolName)
    this.state.currentStep.category = category

    this.emit()
  }

  toolExecStart(_toolName: string, _args: Record<string, unknown>): void {
    // Tool is already tracked via toolCallEnd — spinner is shown automatically
    this.emit()
  }

  toolResult(toolName: string, result: string, isError: boolean): void {
    if (!this.state.currentStep) return

    const toolCalls = [...this.state.currentStep.toolCalls]
    // Find the last tool call matching this tool name that has no result
    for (let i = toolCalls.length - 1; i >= 0; i--) {
      if (toolCalls[i]!.name === toolName && !toolCalls[i]!.result) {
        toolCalls[i] = {
          ...toolCalls[i]!,
          result,
          isError,
          endTime: Date.now(),
        }
        break
      }
    }

    // Override category to error if tool failed
    const category = isError ? 'error' : this.state.currentStep.category

    this.state.currentStep = {
      ...this.state.currentStep,
      toolCalls,
      category,
    }
    this.emit()
  }

  done(finalAnswer: string | null, error: string | null): void {
    // Complete current step
    if (this.state.currentStep) {
      this.state.currentStep.isComplete = true
      this.state.steps = [...this.state.steps, this.state.currentStep]
      this.state.currentStep = null
    }

    this.state = {
      ...this.state,
      finalAnswer,
      error,
      isRunning: false,
    }
    this.emit()
  }

  setError(error: string): void {
    this.state = {
      ...this.state,
      error,
      isRunning: false,
    }
    this.emit()
  }
}

// ---------------------------------------------------------------------------
// Bridge component: subscribes to StateStore and re-renders App
// ---------------------------------------------------------------------------

interface BridgeProps {
  store: StateStore
  version: string
  provider: string
  model: string
}

function Bridge({ store, version, provider, model }: BridgeProps) {
  const [state, setState] = useState<AppState>(store.getState())

  useEffect(() => {
    return store.subscribe(setState)
  }, [store])

  return (
    <App
      state={state}
      version={version}
      provider={provider}
      model={model}
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
}

export class InkRenderer implements Renderer {
  private inkInstance: Instance | null = null
  private readonly store: StateStore
  private readonly config: InkRendererConfig

  constructor(config: InkRendererConfig) {
    this.config = config
    this.store = new StateStore(config.maxSteps)

    // Mount Ink
    this.inkInstance = render(
      <Bridge
        store={this.store}
        version={config.version}
        provider={config.provider}
        model={config.model}
      />,
    )
  }

  onEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'step_start':
        this.store.stepStart(event.step)
        break

      case 'text_delta':
        this.store.textDelta(event.delta)
        break

      case 'text_end':
        this.store.textEnd(event.text)
        break

      case 'toolcall_end':
        this.store.toolCallEnd(
          event.toolCall.name,
          event.toolCall.arguments as Record<string, unknown>,
        )
        break

      case 'tool_exec_start':
        this.store.toolExecStart(event.toolName, event.args)
        break

      case 'tool_result':
        this.store.toolResult(event.toolName, event.result, event.isError)
        break

      case 'done':
        if (event.result.type === 'success') {
          this.store.done(event.result.text || null, null)
        } else {
          this.store.done(null, event.result.error)
        }
        break

      case 'error':
        this.store.setError(event.error)
        break
    }
  }

  cleanup(): void {
    if (this.inkInstance) {
      this.inkInstance.unmount()
      this.inkInstance = null
    }
  }
}
