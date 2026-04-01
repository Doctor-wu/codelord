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
import { createInitialState, finalizeCompletedStepCategory } from './ink/state.js'
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
      const completedStep: StepState = {
        ...this.state.currentStep,
        category: finalizeCompletedStepCategory(this.state.currentStep),
        isComplete: true,
      }
      this.state.steps = [...this.state.steps, completedStep]
    }

    this.state.currentStep = {
      step,
      category: 'text',
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
    if (this.state.currentStep && this.state.currentStep.toolCalls.length === 0) {
      this.state.currentStep = {
        ...this.state.currentStep,
        category: 'text',
      }
    }
    this.emit()
  }

  toolCallEnd(toolName: string, args: Record<string, unknown>): void {
    if (!this.state.currentStep) return

    const command = typeof args.command === 'string'
      ? args.command
      : toolName

    const toolCalls = [...this.state.currentStep.toolCalls]
    const existingIndex = findLatestPendingToolCallIndex(toolCalls, toolName)

    if (existingIndex === undefined) {
      toolCalls.push({
        name: toolName,
        args,
        command,
        result: '',
        isError: false,
        isExecuting: false,
        hasStdout: false,
        hasStderr: false,
        startTime: Date.now(),
      })
    } else {
      toolCalls[existingIndex] = {
        ...toolCalls[existingIndex]!,
        name: toolName,
        args,
        command,
      }
    }

    this.state.currentStep = {
      ...this.state.currentStep,
      toolCalls,
      category: classifyStepCategory(toolName, command),
    }
    this.emit()
  }

  toolCallStart(contentIndex: number, toolName: string, args: Record<string, unknown>): void {
    if (!this.state.currentStep) return

    const streamKey = `tool-${contentIndex}`
    const command = typeof args.command === 'string'
      ? args.command
      : toolName
    const toolCalls = [...this.state.currentStep.toolCalls]
    const existingIndex = toolCalls.findIndex((toolCall) => toolCall.streamKey === streamKey)

    if (existingIndex === -1) {
      toolCalls.push({
        streamKey,
        name: toolName,
        args,
        command,
        result: '',
        isError: false,
        isExecuting: false,
        hasStdout: false,
        hasStderr: false,
        startTime: Date.now(),
      })
    } else {
      toolCalls[existingIndex] = {
        ...toolCalls[existingIndex]!,
        name: toolName,
        args,
        command,
      }
    }

    this.state.currentStep = {
      ...this.state.currentStep,
      toolCalls,
      category: classifyStepCategory(toolName, command),
    }
    this.emit()
  }

  toolCallDelta(contentIndex: number, toolName: string, args: Record<string, unknown>): void {
    if (!this.state.currentStep) return

    const streamKey = `tool-${contentIndex}`
    const command = typeof args.command === 'string'
      ? args.command
      : toolName
    const toolCalls = [...this.state.currentStep.toolCalls]
    const existingIndex = toolCalls.findIndex((toolCall) => toolCall.streamKey === streamKey)

    if (existingIndex === -1) {
      toolCalls.push({
        streamKey,
        name: toolName,
        args,
        command,
        result: '',
        isError: false,
        isExecuting: false,
        hasStdout: false,
        hasStderr: false,
        startTime: Date.now(),
      })
    } else {
      toolCalls[existingIndex] = {
        ...toolCalls[existingIndex]!,
        name: toolName,
        args,
        command,
      }
    }

    this.state.currentStep = {
      ...this.state.currentStep,
      toolCalls,
      category: classifyStepCategory(toolName, command),
    }
    this.emit()
  }

  toolExecStart(toolName: string, args: Record<string, unknown>): void {
    if (!this.state.currentStep) return

    const toolCalls = [...this.state.currentStep.toolCalls]
    const existingIndex = findLatestPendingToolCallIndex(toolCalls, toolName)

    if (existingIndex === undefined) {
      const command = typeof args.command === 'string'
        ? args.command
        : toolName

      toolCalls.push({
        name: toolName,
        args,
        command,
        result: '',
        isError: false,
        isExecuting: true,
        hasStdout: false,
        hasStderr: false,
        startTime: Date.now(),
      })
    } else {
      toolCalls[existingIndex] = {
        ...toolCalls[existingIndex]!,
        isExecuting: true,
      }
    }

    this.state.currentStep = {
      ...this.state.currentStep,
      toolCalls,
    }
    this.emit()
  }

  toolOutputDelta(toolName: string, stream: 'stdout' | 'stderr', chunk: string): void {
    if (!this.state.currentStep) return

    const toolCalls = [...this.state.currentStep.toolCalls]
    for (let i = toolCalls.length - 1; i >= 0; i--) {
      const toolCall = toolCalls[i]
      if (!toolCall || toolCall.name !== toolName || toolCall.endTime) continue

      let nextResult = toolCall.result ?? ''
      let hasStdout = toolCall.hasStdout
      let hasStderr = toolCall.hasStderr

      if (stream === 'stdout' && !hasStdout) {
        nextResult += `${nextResult ? '\n' : ''}stdout:\n`
        hasStdout = true
      }

      if (stream === 'stderr' && !hasStderr) {
        nextResult += `${nextResult ? '\n' : ''}stderr:\n`
        hasStderr = true
      }

      nextResult += chunk

      toolCalls[i] = {
        ...toolCall,
        result: nextResult,
        hasStdout,
        hasStderr,
      }
      break
    }

    this.state.currentStep = {
      ...this.state.currentStep,
      toolCalls,
    }
    this.emit()
  }

  toolResult(toolName: string, result: string, isError: boolean): void {
    if (!this.state.currentStep) return

    const toolCalls = [...this.state.currentStep.toolCalls]
    // Find the last unfinished tool call matching this tool name.
    for (let i = toolCalls.length - 1; i >= 0; i--) {
      if (toolCalls[i]!.name === toolName && !toolCalls[i]!.endTime) {
        const currentResult = toolCalls[i]!.result ?? ''
        toolCalls[i] = {
          ...toolCalls[i]!,
          result: currentResult.trim().length
            ? appendFinalToolMetadata(currentResult, result)
            : result,
          isError,
          isExecuting: false,
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
      const completedStep: StepState = {
        ...this.state.currentStep,
        category: finalizeCompletedStepCategory(this.state.currentStep),
        isComplete: true,
      }
      this.state.steps = [...this.state.steps, completedStep]
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

      case 'toolcall_start':
        this.store.toolCallStart(event.contentIndex, event.toolName, event.args)
        break

      case 'toolcall_delta':
        this.store.toolCallDelta(event.contentIndex, event.toolName, event.args)
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

      case 'tool_output_delta':
        this.store.toolOutputDelta(event.toolName, event.stream, event.chunk)
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

function appendFinalToolMetadata(currentResult: string, finalResult: string): string {
  const truncationMatch = finalResult.match(/\[output truncated[^\]]*\]$/)
  if (!truncationMatch || currentResult.includes(truncationMatch[0])) {
    return currentResult
  }

  return `${currentResult}\n${truncationMatch[0]}`
}

function classifyStepCategory(toolName: string, command: string): StepCategory {
  return toolName === 'bash'
    ? classifyCommand(command)
    : classifyToolName(toolName)
}

function findLatestPendingToolCallIndex(
  toolCalls: ToolCallState[],
  toolName: string,
): number | undefined {
  return [...toolCalls]
    .map((toolCall, index) => ({ toolCall, index }))
    .reverse()
    .find(({ toolCall }) => toolCall.name === toolName && !toolCall.endTime)
    ?.index
}
