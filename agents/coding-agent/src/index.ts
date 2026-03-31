import { getModel } from '@mariozechner/pi-ai'
import { loginOpenAICodex } from '@mariozechner/pi-ai/oauth'
import type { OAuthCredentials } from '@mariozechner/pi-ai'
import { ProcessTerminal, TUI, Markdown, Text } from '@mariozechner/pi-tui'
import type { MarkdownTheme } from '@mariozechner/pi-tui'
import { runAgent, bashTool, createBashToolHandler } from '@agent/core'
import type { AgentEvent, ToolHandler } from '@agent/core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as readline from 'node:readline/promises'

// --- OAuth credential persistence (copied from playground) ---

const CREDENTIALS_PATH = path.resolve(import.meta.dirname, '../../.oauth-credentials.json')

function loadCredentials(): OAuthCredentials | null {
  try {
    const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf-8')
    return JSON.parse(raw) as OAuthCredentials
  } catch {
    return null
  }
}

function saveCredentials(creds: OAuthCredentials): void {
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2))
}

async function getApiKey(): Promise<string> {
  const saved = loadCredentials()

  if (saved && saved.expires > Date.now() + 60_000) {
    return saved.access
  }

  if (saved?.refresh) {
    const { refreshOpenAICodexToken } = await import('@mariozechner/pi-ai/oauth')
    try {
      const refreshed = await refreshOpenAICodexToken(saved.refresh)
      saveCredentials(refreshed)
      return refreshed.access
    } catch {
      // fall through to full login
    }
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const credentials = await loginOpenAICodex({
    onAuth: (info) => {
      console.log(`\n  Open this URL in your browser:\n  ${info.url}\n`)
      if (info.instructions) console.log(`  ${info.instructions}`)
    },
    onPrompt: async (prompt) => {
      const answer = await rl.question(`${prompt.message} `)
      return answer
    },
  })
  rl.close()
  saveCredentials(credentials)
  return credentials.access
}

// --- Markdown theme (minimal, no external deps) ---

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

// --- Tool definitions & handlers ---

const toolHandlers = new Map<string, ToolHandler>([
  ['bash', createBashToolHandler({ cwd: process.cwd() })],
])

// --- User prompt from CLI args ---

const userMessage = process.argv[2] || 'Explain the project structure of this repo'

// --- Main ---

// Get API key before starting TUI (may need interactive login)
const apiKey = await getApiKey()
const model = getModel('openai-codex', 'gpt-5.4')

// Set up TUI
const terminal = new ProcessTerminal()
const tui = new TUI(terminal)

// Message area — accumulates all agent output as markdown
let mdContent = ''
const messageArea = new Markdown('', 1, 1, mdTheme)

// Status bar — shows current step / state
const statusBar = new Text('\x1b[2m Waiting...\x1b[0m', 1, 0)

tui.addChild(messageArea)
tui.addChild(statusBar)
tui.start()

function appendMarkdown(text: string): void {
  mdContent += text
  messageArea.setText(mdContent)
  tui.requestRender()
}

function setStatus(text: string): void {
  statusBar.setText(`\x1b[2m ${text}\x1b[0m`)
  tui.requestRender()
}

function onEvent(event: AgentEvent): void {
  switch (event.type) {
    case 'step_start':
      setStatus(`Step ${event.step}`)
      break

    case 'text_delta':
      appendMarkdown(event.delta)
      break

    case 'text_end':
      // Ensure a newline after text block
      appendMarkdown('\n')
      break

    case 'toolcall_end':
      appendMarkdown(`\n\`[tool call]\` **${event.toolCall.name}**(${JSON.stringify(event.toolCall.arguments)})\n`)
      break

    case 'tool_exec_start':
      setStatus(`Running: ${(event.args.command as string) ?? event.toolName}`)
      break

    case 'tool_result':
      appendMarkdown(`\n\`[tool result]\` ${event.toolName} → \`${event.result}\`\n`)
      break

    case 'done':
      if (event.result.type === 'success') {
        setStatus(`Done — ${event.result.steps} step(s)`)
      } else {
        setStatus(`Error — ${event.result.error}`)
      }
      break

    case 'error':
      appendMarkdown(`\n**Error:** ${event.error}\n`)
      setStatus(`Error`)
      break
  }
}

// Run agent
const systemPrompt = `You are a coding agent. You can execute bash commands to explore codebases, read files, run tests, and help debug issues.

When investigating code:
1. Start by understanding the project structure (ls, find, cat package.json)
2. Read relevant files to understand the code
3. If asked to fix something, explain what you found and suggest changes

Always explain your reasoning before executing commands.`

await runAgent({
  model,
  systemPrompt,
  tools: [bashTool],
  toolHandlers,
  userMessage,
  apiKey,
  maxSteps: 10,
  onEvent,
})

// Keep TUI alive briefly so user can read the result, then clean up on keypress
tui.addInputListener((data) => {
  if (data === 'q' || data === '\x1b' || data === '\x03') {
    tui.stop()
    process.exit(0)
  }
  return undefined
})
setStatus(statusBar.render(terminal.columns).join('').trim() + ' — press q to exit')
