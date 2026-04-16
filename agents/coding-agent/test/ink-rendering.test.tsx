import React from 'react'
import { renderToString } from 'ink'
import { describe, expect, it } from 'vitest'
import { App } from '../src/renderer/ink/App.js'
import { classifyCommand, classifyToolName } from '../src/renderer/ink/classify.js'
import { createInitialTimelineState, captureTimelineSnapshot } from '../src/renderer/ink/timeline-projection.js'
import type { TimelineState } from '../src/renderer/ink/timeline-projection.js'
import { TimelineStore } from '../src/renderer/ink/timeline-store.js'
import { createToolCallLifecycle } from '@codelord/core'
import { derivePhaseFeedback } from '../src/renderer/tool-display.js'

function storeFromState(state: TimelineState): TimelineStore {
  const store = new TimelineStore()
  store.hydrateFromSnapshot(captureTimelineSnapshot(state))
  return store
}

// ---------------------------------------------------------------------------
// App rendering (timeline-based)
// ---------------------------------------------------------------------------

describe('App rendering', () => {
  it('renders empty timeline without crashing', () => {
    const state = createInitialTimelineState()
    const output = renderToString(
      <App
        store={storeFromState(state)}
        inputBridge={null}
        version="0.0.1"
        cwd="/test"
        provider="openai"
        model="gpt-5.4"
        reasoningLevel="high"
      />,
    )

    expect(output).toContain('██████╗')
  })

  it('renders the tool card instead of thinking once a tool call exists', () => {
    const state: TimelineState = {
      ...createInitialTimelineState(),
      items: [
        {
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
        },
      ],
    }

    const output = renderToString(
      <App
        store={storeFromState(state)}
        inputBridge={null}
        version="0.0.1"
        cwd="/test"
        provider="openai"
        model="gpt-5.4"
        reasoningLevel="high"
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
      items: [
        {
          type: 'tool_call',
          id: 'tc-1',
          toolCall: tc,
        },
      ],
    }

    const output = renderToString(
      <App
        store={storeFromState(state)}
        inputBridge={null}
        version="0.0.1"
        cwd="/test"
        provider="openai"
        model="gpt-5.4"
        reasoningLevel="high"
      />,
    )

    expect(output).toContain('◉')
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
    expect(classifyCommand('pwd && if [ -e result.md ]; then rm -f result.md; fi')).toBe('write')
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
  it('does not show working indicator when isIdle is true', () => {
    const state = createInitialTimelineState(true)
    const output = renderToString(
      <App
        store={storeFromState(state)}
        inputBridge={null}
        version="0.0.1"
        cwd="/test"
        provider="openai"
        model="gpt-5.4"
        reasoningLevel="high"
      />,
    )

    // Idle state should not show any working/thinking indicator
    expect(output).not.toContain('working')
  })

  it('renders header in both idle and non-idle states', () => {
    const state = createInitialTimelineState()
    const output = renderToString(
      <App
        store={storeFromState(state)}
        inputBridge={null}
        version="0.0.1"
        cwd="/test"
        provider="openai"
        model="gpt-5.4"
        reasoningLevel="high"
      />,
    )

    expect(output).toContain('██████╗')
    expect(output).toContain('gpt-5.4')
  })
})

// ---------------------------------------------------------------------------
// Header status reflects session mode after resume
// ---------------------------------------------------------------------------

describe('Header status reflects session mode', () => {
  it('shows YOUR TURN in header when resumeContext has pending question', () => {
    const state: TimelineState = {
      ...createInitialTimelineState(true),
      resumeContext: {
        isResumed: true,
        wasDowngraded: false,
        interruptedDuring: null,
        hasPendingQuestion: true,
        pendingInboundCount: 0,
      },
      items: [
        {
          type: 'question',
          id: 'q-1',
          question: 'Which DB?',
          detail: null,
          reasoning: null,
          timestamp: Date.now(),
        },
      ],
    }

    const output = renderToString(
      <App
        store={storeFromState(state)}
        inputBridge={null}
        version="0.0.1"
        cwd="/test"
        provider="openai"
        model="gpt-5.4"
        reasoningLevel="high"
      />,
    )

    expect(output).toContain('YOUR TURN')
    expect(output).not.toContain('IDLE')
  })

  it('shows IDLE in header when resumeContext has wasDowngraded (interrupted status removed)', () => {
    const state: TimelineState = {
      ...createInitialTimelineState(true),
      resumeContext: {
        isResumed: true,
        wasDowngraded: true,
        interruptedDuring: 'STREAMING',
        hasPendingQuestion: false,
        pendingInboundCount: 0,
      },
    }

    const output = renderToString(
      <App
        store={storeFromState(state)}
        inputBridge={null}
        version="0.0.1"
        cwd="/test"
        provider="openai"
        model="gpt-5.4"
        reasoningLevel="high"
      />,
    )

    expect(output).toContain('IDLE')
    expect(output).not.toContain('PAUSED')
  })

  it('shows IDLE for normal fresh session', () => {
    const state = createInitialTimelineState(true)

    const output = renderToString(
      <App
        store={storeFromState(state)}
        inputBridge={null}
        version="0.0.1"
        cwd="/test"
        provider="openai"
        model="gpt-5.4"
        reasoningLevel="high"
      />,
    )

    expect(output).toContain('IDLE')
    expect(output).not.toContain('YOUR TURN')
    expect(output).not.toContain('PAUSED')
  })
})

// ---------------------------------------------------------------------------
// Derived phase feedback for built-in tools
// ---------------------------------------------------------------------------

describe('derivePhaseFeedback', () => {
  it('returns tool-specific feedback for file_read in executing phase', () => {
    expect(derivePhaseFeedback('file_read', 'executing', { file_path: '/src/foo.ts' })).toBe('reading …/src/foo.ts…')
  })

  it('returns tool-specific feedback for file_write', () => {
    expect(derivePhaseFeedback('file_write', 'executing', { file_path: '/a/b/c.ts' })).toBe('writing …/b/c.ts…')
  })

  it('returns tool-specific feedback for file_edit', () => {
    expect(derivePhaseFeedback('file_edit', 'executing', { file_path: 'short.ts' })).toBe('editing short.ts…')
  })

  it('returns search feedback with query', () => {
    expect(derivePhaseFeedback('search', 'executing', { query: 'TODO' })).toBe('searching "TODO"…')
  })

  it('truncates long search queries', () => {
    const long = 'a'.repeat(40)
    const result = derivePhaseFeedback('search', 'executing', { query: long })!
    expect(result.length).toBeLessThan(50)
    expect(result).toContain('…')
  })

  it('returns ls feedback with path', () => {
    expect(derivePhaseFeedback('ls', 'executing', { path: '/home/user/project' })).toBe('listing …/user/project…')
  })

  it('returns ls feedback with default path', () => {
    expect(derivePhaseFeedback('ls', 'executing', {})).toBe('listing .…')
  })

  it('returns null for non-executing phase', () => {
    expect(derivePhaseFeedback('file_read', 'generating', { file_path: '/foo.ts' })).toBeNull()
  })

  it('returns null for unknown tools', () => {
    expect(derivePhaseFeedback('custom_tool', 'executing', {})).toBeNull()
  })

  it('falls back gracefully when file_path is missing', () => {
    expect(derivePhaseFeedback('file_read', 'executing', {})).toBe('reading file…')
  })
})

describe('Built-in tool card shows derived feedback when no stdout', () => {
  it('shows tool-specific phase label instead of generic executing', () => {
    const tc = createToolCallLifecycle({
      id: 'tc-read',
      toolName: 'file_read',
      args: { file_path: '/src/index.ts' },
      command: '/src/index.ts',
    })
    tc.phase = 'executing'
    tc.executionStartedAt = Date.now()
    // No stdout, no stderr

    const state: TimelineState = {
      ...createInitialTimelineState(),
      items: [
        {
          type: 'tool_call',
          id: 'tc-read',
          toolCall: tc,
        },
      ],
    }

    const output = renderToString(
      <App
        store={storeFromState(state)}
        inputBridge={null}
        version="0.0.1"
        cwd="/test"
        provider="openai"
        model="gpt-5.4"
        reasoningLevel="high"
      />,
    )

    expect(output).toContain('reading')
    expect(output).not.toContain('executing')
  })

  it('hides derived feedback once stdout appears', () => {
    const tc = createToolCallLifecycle({
      id: 'tc-read2',
      toolName: 'file_read',
      args: { file_path: '/src/index.ts' },
      command: '/src/index.ts',
    })
    tc.phase = 'executing'
    tc.executionStartedAt = Date.now()
    tc.stdout = 'file contents here'

    const state: TimelineState = {
      ...createInitialTimelineState(),
      items: [
        {
          type: 'tool_call',
          id: 'tc-read2',
          toolCall: tc,
        },
      ],
    }

    const output = renderToString(
      <App
        store={storeFromState(state)}
        inputBridge={null}
        version="0.0.1"
        cwd="/test"
        provider="openai"
        model="gpt-5.4"
        reasoningLevel="high"
      />,
    )

    // Should show actual stdout, not derived feedback
    expect(output).toContain('file contents here')
    expect(output).not.toContain('reading')
  })
})
