import { ProcessTerminal, TUI, Markdown, Text } from '@mariozechner/pi-tui'
import type { MarkdownTheme } from '@mariozechner/pi-tui'
import type { AgentEvent } from '@agent/core'
import type { Renderer } from './types.js'

// ---------------------------------------------------------------------------
// Markdown theme (ANSI colors, no external deps)
// ---------------------------------------------------------------------------

const mdTheme: MarkdownTheme = {
  heading: (t) => `\x1b[1;36m${t}\x1b[0m`,
  link: (t) => `\x1b[4;34m${t}\x1b[0m`,
  linkUrl: (t) => `\x1b[2;34m${t}\x1b[0m`,
  code: (t) => `\x1b[43;30m ${t} \x1b[0m`,
  codeBlock: (t) => `\x1b[2m${t}\x1b[0m`,
  codeBlockBorder: (t) => `\x1b[2m${t}\x1b[0m`,
  quote: (t) => `\x1b[3m${t}\x1b[0m`,
  quoteBorder: (t) => `\x1b[2m${t}\x1b[0m`,
  hr: (t) => `\x1b[2m${t}\x1b[0m`,
  listBullet: (t) => `\x1b[33m${t}\x1b[0m`,
  bold: (t) => `\x1b[1m${t}\x1b[0m`,
  italic: (t) => `\x1b[3m${t}\x1b[0m`,
  strikethrough: (t) => `\x1b[9m${t}\x1b[0m`,
  underline: (t) => `\x1b[4m${t}\x1b[0m`,
}

// ---------------------------------------------------------------------------
// TUIRenderer — rich terminal UI output
// ---------------------------------------------------------------------------

export class TUIRenderer implements Renderer {
  private readonly terminal: ProcessTerminal
  private readonly tui: TUI
  private readonly messageArea: Markdown
  private readonly statusBar: Text
  private mdContent = ''

  constructor() {
    this.terminal = new ProcessTerminal()
    this.tui = new TUI(this.terminal)

    this.messageArea = new Markdown('', 1, 1, mdTheme)
    this.statusBar = new Text('\x1b[2m Waiting...\x1b[0m', 1, 0)

    this.tui.addChild(this.messageArea)
    this.tui.addChild(this.statusBar)
  }

  // --- TUI lifecycle (called by upper layer) ---

  start(): void {
    this.tui.start()
  }

  stop(): void {
    this.tui.stop()
  }

  /** Expose TUI for upper-layer input handling. */
  getTui(): TUI {
    return this.tui
  }

  /** Expose terminal for upper-layer queries (e.g. column width). */
  getTerminal(): ProcessTerminal {
    return this.terminal
  }

  // --- Renderer interface ---

  onEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'step_start':
        this.setStatus(`Step ${event.step}`)
        break

      case 'text_delta':
        this.appendMarkdown(event.delta)
        break

      case 'text_end':
        this.appendMarkdown('\n')
        break

      case 'toolcall_end':
        this.appendMarkdown(
          `\n\`[tool call]\` **${event.toolCall.name}**(${JSON.stringify(event.toolCall.arguments)})\n`,
        )
        break

      case 'tool_exec_start':
        this.setStatus(`Running: ${(event.args.command as string) ?? event.toolName}`)
        break

      case 'tool_result':
        this.appendMarkdown(
          `\n\`[tool result]\` ${event.toolName} → \`${event.result}\`\n`,
        )
        break

      case 'done':
        if (event.result.type === 'success') {
          this.setStatus(`Done — ${event.result.steps} step(s)`)
        } else {
          this.setStatus(`Error — ${event.result.error}`)
        }
        break

      case 'error':
        this.appendMarkdown(`\n**Error:** ${event.error}\n`)
        this.setStatus('Error')
        break
    }
  }

  cleanup(): void {
    // Final status — no "press q" hint, that's the upper layer's job
    const current = this.statusBar.render(this.terminal.columns).join('').trim()
    this.setStatus(current)
  }

  // --- Internal helpers ---

  private appendMarkdown(text: string): void {
    this.mdContent += text
    this.messageArea.setText(this.mdContent)
    this.tui.requestRender()
  }

  private setStatus(text: string): void {
    this.statusBar.setText(`\x1b[2m ${text}\x1b[0m`)
    this.tui.requestRender()
  }
}
