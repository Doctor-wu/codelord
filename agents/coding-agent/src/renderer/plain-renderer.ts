import type { AgentEvent } from '@agent/core'
import type { Renderer } from './types.js'

// ---------------------------------------------------------------------------
// PlainTextRenderer — stdout-only output for non-interactive use
// ---------------------------------------------------------------------------

const RESULT_TRUNCATE = 200

export class PlainTextRenderer implements Renderer {
  onEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'step_start':
        process.stdout.write(`--- Step ${event.step} ---\n`)
        break

      case 'text_delta':
        process.stdout.write(event.delta)
        break

      case 'text_end':
        process.stdout.write('\n')
        break

      case 'toolcall_end':
        process.stdout.write(
          `[tool] ${event.toolCall.name}(${JSON.stringify(event.toolCall.arguments)})\n`,
        )
        break

      case 'tool_exec_start':
        process.stdout.write(
          `[exec] ${(event.args.command as string) ?? event.toolName}\n`,
        )
        break

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
}
