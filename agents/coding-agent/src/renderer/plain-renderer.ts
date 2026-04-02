import type { Renderer } from './types.js'
import type { AgentEvent } from '@agent/core'
import { extractToolCommand, formatToolDisplayName } from './tool-display.js'

// ---------------------------------------------------------------------------
// PlainTextRenderer — stdout-only output for non-interactive use
// ---------------------------------------------------------------------------

const RESULT_TRUNCATE = 200

export class PlainTextRenderer implements Renderer {
  private thinkingOpen = false
  private textOpen = false

  onEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'step_start':
        this.thinkingOpen = false
        this.textOpen = false
        process.stdout.write(`--- Step ${event.step} ---\n`)
        break

      case 'thinking_start':
        this.openThinkingBlock()
        break

      case 'thinking_delta':
        this.openThinkingBlock()
        process.stdout.write(event.delta)
        break

      case 'thinking_end':
        if (this.thinkingOpen) {
          process.stdout.write('\n')
          this.thinkingOpen = false
        }
        break

      case 'text_start':
        this.openTextBlock()
        break

      case 'text_delta':
        this.openTextBlock()
        process.stdout.write(event.delta)
        break

      case 'text_end':
        if (this.textOpen) {
          process.stdout.write('\n')
          this.textOpen = false
        }
        break

      case 'toolcall_end':
        process.stdout.write(
          `[tool] ${event.toolCall.name}(${JSON.stringify(event.toolCall.arguments)})\n`,
        )
        break

      case 'tool_exec_start': {
        const displayName = formatToolDisplayName(event.toolName)
        const cmd = extractToolCommand(event.toolName, event.args as Record<string, unknown>)
        process.stdout.write(`[exec] ${displayName} ${cmd}\n`)
        break
      }

      case 'tool_result': {
        const result = event.result.length > RESULT_TRUNCATE
          ? event.result.slice(0, RESULT_TRUNCATE) + '...'
          : event.result
        process.stdout.write(`[result] ${event.toolName} → ${result}\n`)
        break
      }

      case 'done':
        if (event.result.type === 'success') {
          process.stdout.write(`=== Done (${event.result.steps} steps) ===\n`)
        } else {
          process.stderr.write(`=== Error: ${event.result.error} ===\n`)
        }
        break

      case 'error':
        process.stderr.write(`Error: ${event.error}\n`)
        break
    }
  }

  cleanup(): void {
    // Nothing to clean up for plain text output
  }

  private openThinkingBlock(): void {
    if (this.thinkingOpen) return
    this.thinkingOpen = true
    this.textOpen = false
    process.stdout.write('[thinking] ')
  }

  private openTextBlock(): void {
    if (this.textOpen) return
    this.textOpen = true
    this.thinkingOpen = false
    process.stdout.write('[assistant] ')
  }
}
