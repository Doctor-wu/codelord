import React from 'react'
import { renderToString } from 'ink'
import { describe, expect, it } from 'vitest'
import { App } from '../src/renderer/ink/App.js'
import { classifyCommand, classifyToolName } from '../src/renderer/ink/classify.js'
import { createInitialTimelineState } from '../src/renderer/ink/timeline-projection.js'
import type { TimelineState } from '../src/renderer/ink/timeline-projection.js'
import { createToolCallLifecycle } from '@agent/core'

// ---------------------------------------------------------------------------
// App rendering (timeline-based)
// ---------------------------------------------------------------------------

describe('App rendering', () => {
  it('shows a working indicator before the first step starts', () => {
    const state = createInitialTimelineState()
    const output = renderToString(
      <App
        state={state}
        version="0.0.1"
        provider="openai"
        model="gpt-5.4"
        maxSteps={10}
      />,
    )

    expect(output).toContain('thinking')
  })

  it('renders the tool card instead of thinking once a tool call exists', () => {
    const state: TimelineState = {
      ...createInitialTimelineState(),
      items: [{
        type: 'tool_call',
        id: 'tc-1',
        toolCall: {
          ...createToolCallLifecycle({
            id: 'tc-1',
            toolName: 'bash',
            args: { command: 'rm -f result.md' },
            command: 'rm -f result.md',
          }),
          phase: 'generating',
        },
      }],
    }

    const output = renderToString(
      <App
        state={state}
        version="0.0.1"
        provider="openai"
        model="gpt-5.4"
        maxSteps={10}
      />,
    )

    expect(output).toContain('Bash(rm -f result.md)')
    expect(output).toContain('building')
  })

  it('keeps rendering the tool card during execution after output starts streaming', () => {
    const tc = createToolCallLifecycle({
      id: 'tc-1',
      toolName: 'bash',
      args: { command: 'cat > result.md' },
      command: 'cat > result.md',
    })
    tc.phase = 'executing'
    tc.stdout = 'writing file'
    tc.executionStartedAt = Date.now()

    const state: TimelineState = {
      ...createInitialTimelineState(),
      items: [{
        type: 'tool_call',
        id: 'tc-1',
        toolCall: tc,
      }],
    }

    const output = renderToString(
      <App
        state={state}
        version="0.0.1"
        provider="openai"
        model="gpt-5.4"
        maxSteps={10}
      />,
    )

    expect(output).toContain('●')
    expect(output).toContain('Bash(cat > result.md)')
    expect(output).toContain('writing file')
  })
})

// ---------------------------------------------------------------------------
// Command classification
// ---------------------------------------------------------------------------

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

describe('Built-in tool classification', () => {
  it('classifies file_read as read', () => {
    expect(classifyToolName('file_read')).toBe('read')
  })

  it('classifies file_write as write', () => {
    expect(classifyToolName('file_write')).toBe('write')
  })

  it('classifies file_edit as write', () => {
    expect(classifyToolName('file_edit')).toBe('write')
  })

  it('classifies search as read', () => {
    expect(classifyToolName('search')).toBe('read')
  })

  it('classifies ls as read', () => {
    expect(classifyToolName('ls')).toBe('read')
  })
})

// ---------------------------------------------------------------------------
// Idle state (REPL)
// ---------------------------------------------------------------------------

describe('Idle state (REPL)', () => {
  it('does not show thinking spinner when isIdle is true', () => {
    const state = createInitialTimelineState(true)
    const output = renderToString(
      <App
        state={state}
        version="0.0.1"
        provider="openai"
        model="gpt-5.4"
        maxSteps={10}
      />,
    )

    expect(output).not.toContain('thinking')
  })

  it('shows thinking spinner when isIdle is false (single-shot default)', () => {
    const state = createInitialTimelineState()
    const output = renderToString(
      <App
        state={state}
        version="0.0.1"
        provider="openai"
        model="gpt-5.4"
        maxSteps={10}
      />,
    )

    expect(output).toContain('thinking')
  })
})