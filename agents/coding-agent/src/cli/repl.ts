import * as readline from 'node:readline'
import type { Api, Model } from '@mariozechner/pi-ai'
import { AgentRuntime } from '@agent/core'
import type { AgentEvent, RunOutcome } from '@agent/core'
import type { CodelordConfig } from '@agent/config'
import { PlainTextRenderer } from '../renderer/index.js'
import { createToolKernel } from './tool-kernel.js'

// ---------------------------------------------------------------------------
// REPL — minimal interactive shell over a single AgentRuntime
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a coding agent. You can execute bash commands to explore codebases, read files, run tests, and help debug issues.

When investigating code:
1. Start by understanding the project structure (ls, find, cat package.json)
2. Read relevant files to understand the code
3. If asked to fix something, explain what you found and suggest changes

Always explain your reasoning before executing commands.`

interface ReplOptions {
  model: Model<Api>
  apiKey: string
  config: CodelordConfig
}

export async function startRepl(options: ReplOptions): Promise<void> {
  const { model, apiKey, config } = options

  const { tools, toolHandlers } = createToolKernel({
    cwd: process.cwd(),
    config,
  })

  const renderer = new PlainTextRenderer()

  const runtime = new AgentRuntime({
    model,
    systemPrompt: SYSTEM_PROMPT,
    tools,
    toolHandlers,
    apiKey,
    maxSteps: config.maxSteps,
    onEvent: (event: AgentEvent) => renderer.onEvent(event),
  })
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  })

  // --- Interrupt handling ---
  // When runtime is running, Ctrl+C requests interrupt.
  // When idle (waiting for input), Ctrl+C exits the REPL.
  let running = false

  process.on('SIGINT', () => {
    if (running) {
      runtime.requestInterrupt()
    } else {
      console.log('\nBye!')
      process.exit(0)
    }
  })

  console.log('codelord REPL (type /exit to quit, Ctrl+C to interrupt)\n')
  rl.prompt()

  for await (const line of rl) {
    const input = line.trim()

    if (!input) {
      rl.prompt()
      continue
    }

    // --- Slash commands ---
    if (input === '/exit') {
      console.log('Bye!')
      rl.close()
      return
    }

    // --- Inject input into runtime ---
    if (runtime.pendingQuestion) {
      // User is answering a pending question
      runtime.answerPendingQuestion(input)
    } else {
      // Normal user turn
      runtime.enqueueUserMessage(input)
    }

    // --- Drive runtime ---
    running = true
    let outcome: RunOutcome
    try {
      outcome = await runtime.run()
    } catch (err) {
      console.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`)
      running = false
      rl.prompt()
      continue
    }
    running = false

    // --- Handle outcome ---
    switch (outcome.type) {
      case 'success':
        // Turn complete, session stays alive
        break

      case 'error':
        console.error(`[error] ${outcome.error}`)
        break

      case 'blocked':
        switch (outcome.reason) {
          case 'waiting_user': {
            const q = runtime.pendingQuestion
            if (q) {
              console.log(`\n[question] ${q.question}`)
              if (q.whyAsk) console.log(`  reason: ${q.whyAsk}`)
              if (q.options?.length) console.log(`  options: ${q.options.join(', ')}`)
              if (q.expectedAnswerFormat) console.log(`  format: ${q.expectedAnswerFormat}`)
              if (q.defaultPlanIfNoAnswer) console.log(`  default: ${q.defaultPlanIfNoAnswer}`)
            }
            break
          }
          case 'interrupted':
            console.log('\n[interrupted] Agent paused. Continue with your next input.')
            break
          case 'pending_input':
            break
        }
        break
    }

    rl.prompt()
  }

  // stdin closed (e.g. piped input exhausted)
  rl.close()
}
