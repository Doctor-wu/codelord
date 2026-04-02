import React from 'react'
import { renderToString } from 'ink'
import { describe, expect, it } from 'vitest'
import { App } from '../src/renderer/ink/App.js'
import { classifyCommand } from '../src/renderer/ink/classify.js'
import { CollapsedStep } from '../src/renderer/ink/CollapsedStep.js'
import { CurrentStep } from '../src/renderer/ink/CurrentStep.js'
import { formatToolTitleLines } from '../src/renderer/ink/ToolCallLine.js'
import { createInitialState } from '../src/renderer/ink/state.js'
import type { StepState, ToolCallState } from '../src/renderer/ink/state.js'

function makeStep(overrides: Partial<StepState> = {}): StepState {
  return {
    step: 1,
    category: 'text',
    thinking: '',
    text: '',
    toolCalls: [],
    isComplete: true,
    ...overrides,
  }
}

function makeToolCall(overrides: Partial<ToolCallState> = {}): ToolCallState {
  return {
    name: 'bash',
    args: { command: 'ls -la' },
    command: 'ls -la',
    result: '',
    isError: false,
    isExecuting: false,
    hasStdout: false,
    hasStderr: false,
    startTime: 0,
    endTime: 1,
    ...overrides,
  }
}

describe('CollapsedStep rendering', () => {
  it('preserves multi-line text steps without collapsing them', () => {
    const output = renderToString(
      <CollapsedStep
        step={makeStep({
          category: 'text',
          text: 'first line\nsecond line\nthird line',
        })}
      />,
    )

    expect(output).toContain('first line')
    expect(output).toContain('second line')
    expect(output).toContain('third line')
    expect(output).not.toContain('┃')
  })

  it('renders thinking separately from assistant text before tool summaries', () => {
    const output = renderToString(
      <CollapsedStep
        step={makeStep({
          category: 'read',
          thinking: 'inspect project structure',
          text: 'check renderer files',
          toolCalls: [
            makeToolCall({
              args: { command: 'rg renderer' },
              command: 'rg renderer',
              result: 'match-1\nmatch-2',
            }),
          ],
        })}
      />,
    )

    expect(output).toContain('thinking')
    expect(output).toContain('inspect project structure')
    expect(output).toContain('check renderer files')
    expect(output).toMatch(/check renderer files\s+┃ READ\s+┃ Bash\(rg renderer\)/)
    expect(output).toContain('⎿ match-1')
    expect(output).toContain('  match-2')
    expect(output).not.toContain('⎿ match-2')
    expect(output).toContain('Tool call success')
  })

  it('folds long tool output into a +N lines marker', () => {
    const output = renderToString(
      <CollapsedStep
        step={makeStep({
          category: 'read',
          text: 'listing files',
          toolCalls: [
            makeToolCall({
              result: [
                'line-1',
                'line-2',
                'line-3',
                'line-4',
                'line-5',
                'line-6',
                'line-7',
                'line-8',
                'line-9',
              ].join('\n'),
            }),
          ],
        })}
      />,
    )

    expect(output).toContain('⎿ line-1')
    expect(output).toContain('  line-4')
    expect(output).toContain('  line-9')
    expect(output).toContain('  +4 lines')
    expect(output).toContain('Tool call success')
  })

  it('normalizes multi-line commands before rendering the title', () => {
    const output = renderToString(
      <CollapsedStep
        step={makeStep({
          category: 'write',
          toolCalls: [
            makeToolCall({
              args: {
                command: "echo alpha\n&& echo beta",
              },
              command: "echo alpha\n&& echo beta",
              result: 'done',
            }),
          ],
        })}
      />,
    )

    expect(output).toContain('Bash(echo alpha && echo beta)')
  })

  it('truncates long titles with ellipsis after two lines', () => {
    const output = renderToString(
      <CollapsedStep
        step={makeStep({
          category: 'write',
          toolCalls: [
            makeToolCall({
              args: {
                command: "cat > result.md <<'EOF'\n" + 'x'.repeat(160),
              },
              command: "cat > result.md <<'EOF'\n" + 'x'.repeat(160),
              result: 'done',
            }),
          ],
        })}
      />,
    )

    expect(output).toContain("Bash(cat > result.md <<'EOF'")
    expect(output).toContain('…')
  })
})

describe('CurrentStep rendering', () => {
  it('pre-wraps long tool titles so each visual line fits within the available width', () => {
    const lines = formatToolTitleLines({
      toolName: 'Bash',
      command: "cat > result.md <<'EOF' # 当前目录文件列表 路径: /Users/doctorwu/Projects/Self/codelord `text total 344 ...",
      availableWidth: 36,
      isRunning: false,
    })

    expect(lines).toHaveLength(2)
    expect(lines[0]?.text.startsWith('Bash(')).toBe(true)
    expect(lines[0]?.text.length).toBeLessThanOrEqual(36)
    expect(lines[1]?.text.length).toBeLessThanOrEqual(36)
    expect(lines[1]?.text.includes('…')).toBe(true)
  })

  it('shows a working indicator while waiting for the first visible content', () => {
    const output = renderToString(
      <CurrentStep
        step={makeStep({
          isComplete: false,
          category: 'text',
          thinking: '',
          text: '',
          toolCalls: [],
        })}
      />,
    )

    expect(output).toContain('thinking')
  })

  it('renders thinking and assistant text before a running tool block', () => {
    const output = renderToString(
      <CurrentStep
        step={makeStep({
          isComplete: false,
          category: 'read',
          thinking: 'inspect the workspace',
          text: 'I am checking renderer files next.',
          toolCalls: [
            makeToolCall({
              result: undefined,
              endTime: undefined,
            }),
          ],
        })}
      />,
    )

    expect(output).toContain('thinking')
    expect(output).toContain('inspect the workspace')
    expect(output).toContain('I am checking renderer files next.')
    expect(output).toContain('READ')
    expect(output).toContain('●')
    expect(output).toContain('Bash(ls -la)')
    expect(output).toContain('building command...')
    expect(output).not.toContain('Tool call success')
  })

  it('shows an executing state after the tool starts but before output arrives', () => {
    const output = renderToString(
      <CurrentStep
        step={makeStep({
          isComplete: false,
          category: 'read',
          thinking: '',
          text: '',
          toolCalls: [
            makeToolCall({
              result: '',
              isExecuting: true,
              endTime: undefined,
            }),
          ],
        })}
      />,
    )

    expect(output).toContain('READ')
    expect(output).toContain('●')
    expect(output).toContain('executing tool...')
    expect(output).not.toContain('Tool call success')
  })

  it('shows partial tool output while the tool is still running', () => {
    const output = renderToString(
      <CurrentStep
        step={makeStep({
          isComplete: false,
          category: 'read',
          thinking: '',
          text: '',
          toolCalls: [
            makeToolCall({
              result: 'stdout:\nfirst line\nsecond line',
              isExecuting: true,
              hasStdout: true,
              endTime: undefined,
            }),
          ],
        })}
      />,
    )

    expect(output).toContain('READ')
    expect(output).toContain('●')
    expect(output).toContain('Bash(ls -la)')
    expect(output).toContain('⎿ stdout:')
    expect(output).toContain('  first line')
    expect(output).toContain('  second line')
    expect(output).not.toContain('thinking')
    expect(output).not.toContain('Tool call success')
  })

  it('does not show the breathing indicator after a tool completes', () => {
    const output = renderToString(
      <CollapsedStep
        step={makeStep({
          category: 'read',
          toolCalls: [
            makeToolCall({
              result: 'done',
            }),
          ],
        })}
      />,
    )

    expect(output).toContain('Bash(ls -la)')
    expect(output).not.toContain('● Bash')
  })
})

describe('App rendering', () => {
  it('shows a working indicator before the first step starts', () => {
    const state = createInitialState(10)
    const output = renderToString(
      <App
        state={state}
        version="0.0.1"
        provider="openai"
        model="gpt-5.4"
      />,
    )

    expect(output).toContain('thinking')
  })

  it('renders the tool block instead of thinking once a tool call exists', () => {
    const state = createInitialState(10)
    state.currentStep = makeStep({
      isComplete: false,
      category: 'write',
      thinking: '',
      text: '',
      toolCalls: [
        makeToolCall({
          args: { command: 'rm -f result.md' },
          command: 'rm -f result.md',
          result: undefined,
          endTime: undefined,
        }),
      ],
    })

    const output = renderToString(
      <App
        state={state}
        version="0.0.1"
        provider="openai"
        model="gpt-5.4"
      />,
    )

    expect(output).toContain('WRITE')
    expect(output).toContain('Bash(rm -f result.md)')
    expect(output).not.toContain('thinking')
    expect(output).not.toContain('Tool call success')
  })

  it('keeps rendering the tool block during execution after output starts streaming', () => {
    const state = createInitialState(10)
    state.currentStep = makeStep({
      isComplete: false,
      category: 'write',
      thinking: '',
      text: '',
      toolCalls: [
        makeToolCall({
          args: { command: 'cat > result.md' },
          command: 'cat > result.md',
          result: 'stdout:\nwriting file',
          isExecuting: true,
          hasStdout: true,
          endTime: undefined,
        }),
      ],
    })

    const output = renderToString(
      <App
        state={state}
        version="0.0.1"
        provider="openai"
        model="gpt-5.4"
      />,
    )

    expect(output).toContain('WRITE')
    expect(output).toContain('●')
    expect(output).toContain('Bash(cat > result.md)')
    expect(output).toContain('⎿ stdout:')
    expect(output).toContain('  writing file')
    expect(output).not.toContain('thinking')
    expect(output).not.toContain('Tool call success')
  })
})

describe('Command classification', () => {
  it('treats compound commands with write segments as WRITE', () => {
    expect(classifyCommand('pwd && ls -la && rm -f result.md')).toBe('write')
  })

  it('treats shell conditionals containing rm as WRITE', () => {
    expect(
      classifyCommand("pwd && if [ -e result.md ]; then rm -f result.md; fi"),
    ).toBe('write')
  })
})
