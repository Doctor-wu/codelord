import React from 'react'
import { renderToString } from 'ink'
import { describe, it, expect, beforeEach } from 'vitest'
import { App } from '../src/renderer/ink/App.js'
import {
  createInitialTimelineState,
  reduceLifecycleEvent,
  applyThinkingDelta,
  applyTextDelta,
} from '../src/renderer/ink/timeline-projection.js'
import type { TimelineState, AssistantItem, UserItem, QuestionItem, StatusItem, ToolCallItem } from '../src/renderer/ink/timeline-projection.js'
import { createToolCallLifecycle, _resetProvisionalIdCounter, createReasoningState } from '@agent/core'
import type { LifecycleEvent } from '@agent/core'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderApp(state: TimelineState): string {
  return renderToString(
    <App state={state} version="0.0.1" provider="test" model="test" maxSteps={10} />,
  )
}

function simulateFullTurn(initialState?: TimelineState): TimelineState {
  let state = initialState ?? createInitialTimelineState()
  // User turn
  state = reduceLifecycleEvent(state, { type: 'user_turn', id: 'u1', content: 'hello', timestamp: 1 })
  // Assistant turn
  state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 2 })
  state = applyTextDelta(state, 'The answer is 42.')
  state = reduceLifecycleEvent(state, { type: 'assistant_turn_end', id: 'a1', reasoning: { ...createReasoningState(), status: 'completed' }, timestamp: 3 })
  // Session done (success)
  state = reduceLifecycleEvent(state, { type: 'session_done', success: true, text: 'The answer is 42.', timestamp: 4 })
  return state
}

// ---------------------------------------------------------------------------
// 1. Final answer does NOT render twice
// ---------------------------------------------------------------------------

describe('Final result deduplication', () => {
  beforeEach(() => _resetProvisionalIdCounter())

  it('success session_done does not add a status item (text already in AssistantItem)', () => {
    const state = simulateFullTurn()
    // Should have: user, assistant — no 'done' status item
    const types = state.items.map(i => i.type)
    expect(types).toEqual(['user', 'assistant'])
    expect(types).not.toContain('status')
  })

  it('final text appears exactly once in rendered output', () => {
    const state = simulateFullTurn()
    const output = renderApp(state)
    const matches = output.match(/The answer is 42\./g)
    expect(matches).toHaveLength(1)
  })

  it('error session_done still adds an error status item', () => {
    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, { type: 'session_done', success: false, error: 'Max steps exceeded', timestamp: 1 })
    const last = state.items[state.items.length - 1] as StatusItem
    expect(last.type).toBe('status')
    expect(last.status).toBe('error')
    expect(last.message).toBe('Max steps exceeded')
  })
})

// ---------------------------------------------------------------------------
// 2. No extra console/log output (structural — REPL no longer uses console)
// ---------------------------------------------------------------------------

describe('REPL stdout ownership', () => {
  it('REPL module does not import readline', async () => {
    // Structural test: the repl module should not import readline
    const { readFileSync } = await import('node:fs')
    const replSource = readFileSync(
      new URL('../src/cli/repl.ts', import.meta.url),
      'utf-8',
    )
    expect(replSource).not.toContain("from 'node:readline'")
    expect(replSource).not.toContain('require(')
  })

  it('REPL module does not use console.log or console.error', async () => {
    const { readFileSync } = await import('node:fs')
    const replSource = readFileSync(
      new URL('../src/cli/repl.ts', import.meta.url),
      'utf-8',
    )
    expect(replSource).not.toContain('console.log')
    expect(replSource).not.toContain('console.error')
  })
})

// ---------------------------------------------------------------------------
// 3. User input appears exactly once in timeline
// ---------------------------------------------------------------------------

describe('User input in timeline', () => {
  beforeEach(() => _resetProvisionalIdCounter())

  it('user_turn adds exactly one UserItem', () => {
    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, { type: 'user_turn', id: 'u1', content: 'hello world', timestamp: 1 })
    const userItems = state.items.filter(i => i.type === 'user')
    expect(userItems).toHaveLength(1)
    expect((userItems[0] as UserItem).content).toBe('hello world')
  })

  it('user input renders exactly once in App output', () => {
    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, { type: 'user_turn', id: 'u1', content: 'test input', timestamp: 1 })
    const output = renderApp(state)
    const matches = output.match(/test input/g)
    expect(matches).toHaveLength(1)
  })

  it('preserves original text content (no trimming in timeline)', () => {
    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, { type: 'user_turn', id: 'u1', content: '  spaced input  ', timestamp: 1 })
    const item = state.items[0] as UserItem
    expect(item.content).toBe('  spaced input  ')
  })
})

// ---------------------------------------------------------------------------
// 4. waiting_user / question not duplicated
// ---------------------------------------------------------------------------

describe('Question display deduplication', () => {
  beforeEach(() => _resetProvisionalIdCounter())

  it('blocked_enter with waiting_user adds exactly one question item', () => {
    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, {
      type: 'blocked_enter',
      reason: 'waiting_user',
      question: 'What color?',
      timestamp: 1,
    })
    const questionItems = state.items.filter(i => i.type === 'question')
    expect(questionItems).toHaveLength(1)
  })

  it('question text renders exactly once', () => {
    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, {
      type: 'blocked_enter',
      reason: 'waiting_user',
      question: 'Pick a number',
      timestamp: 1,
    })
    const output = renderApp(state)
    const matches = output.match(/Pick a number/g)
    expect(matches).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// 5. interrupted not duplicated
// ---------------------------------------------------------------------------

describe('Interrupted display deduplication', () => {
  beforeEach(() => _resetProvisionalIdCounter())

  it('blocked_enter with interrupted adds exactly one status item', () => {
    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, {
      type: 'blocked_enter',
      reason: 'interrupted',
      timestamp: 1,
    })
    const statusItems = state.items.filter(i => i.type === 'status')
    expect(statusItems).toHaveLength(1)
    expect((statusItems[0] as StatusItem).status).toBe('interrupted')
  })

  it('interrupted message renders exactly once', () => {
    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, {
      type: 'blocked_enter',
      reason: 'interrupted',
      timestamp: 1,
    })
    const output = renderApp(state)
    const matches = output.match(/PAUSED/g)
    expect(matches).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// 6. Tool stdout/stderr streaming still works
// ---------------------------------------------------------------------------

describe('Tool streaming correctness', () => {
  beforeEach(() => _resetProvisionalIdCounter())

  it('tool stdout updates are reflected in timeline', () => {
    let state = createInitialTimelineState()
    const tc = createToolCallLifecycle({ id: 'tc-1', toolName: 'bash', args: { command: 'echo hi' }, command: 'echo hi' })
    tc.phase = 'executing'
    state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: { ...tc } })

    tc.stdout = 'hi\n'
    state = reduceLifecycleEvent(state, { type: 'tool_call_updated', toolCall: { ...tc } })

    const item = state.items[0] as ToolCallItem
    expect(item.toolCall.stdout).toBe('hi\n')
  })

  it('tool stderr updates are reflected in timeline', () => {
    let state = createInitialTimelineState()
    const tc = createToolCallLifecycle({ id: 'tc-1', toolName: 'bash', args: { command: 'bad' }, command: 'bad' })
    tc.phase = 'executing'
    state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: { ...tc } })

    tc.stderr = 'error output\n'
    state = reduceLifecycleEvent(state, { type: 'tool_call_updated', toolCall: { ...tc } })

    const item = state.items[0] as ToolCallItem
    expect(item.toolCall.stderr).toBe('error output\n')
  })

  it('assistant text streaming works via deltas', () => {
    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })
    state = applyTextDelta(state, 'hello ')
    state = applyTextDelta(state, 'world')

    const item = state.items[0] as AssistantItem
    expect(item.text).toBe('hello world')
    expect(item.isStreaming).toBe(true)
  })

  it('assistant thinking is shown as compact summary, not raw dump', () => {
    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })
    state = applyThinkingDelta(state, 'I need to check the project structure first. Then I will look at the config files.')

    const item = state.items[0] as AssistantItem
    // Raw thinking is still stored in the item
    expect(item.thinking).toContain('project structure')

    // But rendered output should NOT contain the full raw thinking dump
    const output = renderApp(state)
    // Should show a compact summary, not the full multi-sentence thinking
    expect(output).not.toContain('Then I will look at the config files')
  })
})

// ---------------------------------------------------------------------------
// 7. Timeline item ordering stability
// ---------------------------------------------------------------------------

describe('Timeline ordering stability', () => {
  beforeEach(() => _resetProvisionalIdCounter())

  it('items appear in chronological order across a full turn', () => {
    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, { type: 'user_turn', id: 'u1', content: 'hi', timestamp: 1 })
    state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 2 })
    const tc = createToolCallLifecycle({ id: 'tc-1', toolName: 'ls', args: {}, command: 'ls' })
    state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: tc })
    state = reduceLifecycleEvent(state, { type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 3 })

    expect(state.items.map(i => i.type)).toEqual(['user', 'assistant', 'tool_call'])
  })

  it('all items have stable ids (not purely index-based)', () => {
    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, { type: 'user_turn', id: 'u1', content: 'hi', timestamp: 1 })
    state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 2 })
    state = reduceLifecycleEvent(state, { type: 'blocked_enter', reason: 'waiting_user', question: 'Q?', timestamp: 3 })

    for (const item of state.items) {
      expect(item).toHaveProperty('id')
      const id = (item as { id: string }).id
      expect(id).toBeTruthy()
      // Ids should be semantically meaningful, not just array indices
      expect(id).not.toMatch(/^[0-9]+$/)
    }
  })

  it('tool call updates do not duplicate items', () => {
    let state = createInitialTimelineState()
    const tc = createToolCallLifecycle({ id: 'tc-1', toolName: 'bash', args: { command: 'ls' }, command: 'ls' })
    state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: { ...tc } })
    tc.phase = 'executing'
    state = reduceLifecycleEvent(state, { type: 'tool_call_updated', toolCall: { ...tc } })
    tc.phase = 'completed'
    tc.result = 'done'
    state = reduceLifecycleEvent(state, { type: 'tool_call_completed', toolCall: { ...tc } })

    expect(state.items).toHaveLength(1)
  })

  it('multi-turn conversation maintains correct order', () => {
    let state = createInitialTimelineState(true)
    // Turn 1
    state = reduceLifecycleEvent(state, { type: 'user_turn', id: 'u1', content: 'first', timestamp: 1 })
    state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 2 })
    state = applyTextDelta(state, 'response 1')
    state = reduceLifecycleEvent(state, { type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 3 })
    state = reduceLifecycleEvent(state, { type: 'session_done', success: true, text: 'response 1', timestamp: 4 })
    // Turn 2
    state = reduceLifecycleEvent(state, { type: 'user_turn', id: 'u2', content: 'second', timestamp: 5 })
    state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a2', reasoning: createReasoningState(), timestamp: 6 })
    state = applyTextDelta(state, 'response 2')
    state = reduceLifecycleEvent(state, { type: 'assistant_turn_end', id: 'a2', reasoning: createReasoningState(), timestamp: 7 })

    expect(state.items.map(i => i.type)).toEqual(['user', 'assistant', 'user', 'assistant'])
    expect((state.items[0] as UserItem).content).toBe('first')
    expect((state.items[2] as UserItem).content).toBe('second')
  })
})

// ---------------------------------------------------------------------------
// 8. QuestionCard with full detail
// ---------------------------------------------------------------------------

describe('QuestionCard detail display', () => {
  beforeEach(() => _resetProvisionalIdCounter())

  it('question item carries full detail when provided', () => {
    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, {
      type: 'blocked_enter',
      reason: 'waiting_user',
      question: 'Pick a color',
      questionDetail: {
        question: 'Pick a color',
        whyAsk: 'Need to set the theme',
        options: ['red', 'blue', 'green'],
        expectedAnswerFormat: 'one word',
        defaultPlanIfNoAnswer: 'use blue',
      },
      timestamp: 1,
    })

    const item = state.items[0] as QuestionItem
    expect(item.detail).not.toBeNull()
    expect(item.detail!.whyAsk).toBe('Need to set the theme')
    expect(item.detail!.options).toEqual(['red', 'blue', 'green'])
    expect(item.detail!.expectedAnswerFormat).toBe('one word')
    expect(item.detail!.defaultPlanIfNoAnswer).toBe('use blue')
  })

  it('question card renders all detail fields', () => {
    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, {
      type: 'blocked_enter',
      reason: 'waiting_user',
      question: 'Pick a color',
      questionDetail: {
        question: 'Pick a color',
        whyAsk: 'Need to set the theme',
        options: ['red', 'blue'],
      },
      timestamp: 1,
    })

    const output = renderApp(state)
    expect(output).toContain('Pick a color')
    expect(output).toContain('Need to set the theme')
    expect(output).toContain('red')
    expect(output).toContain('blue')
  })

  it('question item has null detail when not provided', () => {
    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, {
      type: 'blocked_enter',
      reason: 'waiting_user',
      question: 'Simple question',
      timestamp: 1,
    })

    const item = state.items[0] as QuestionItem
    expect(item.detail).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 9. ToolCallCard route/safety/reasoning display
// ---------------------------------------------------------------------------

describe('ToolCallCard production display', () => {
  beforeEach(() => _resetProvisionalIdCounter())

  it('renders route info when tool was routed', () => {
    const tc = createToolCallLifecycle({ id: 'tc-1', toolName: 'file_read', args: { file_path: 'x.ts' }, command: 'x.ts' })
    tc.route = { wasRouted: true, ruleId: 'bash_cat', originalToolName: 'bash', originalArgs: { command: 'cat x.ts' }, reason: 'cat → Read' }
    tc.phase = 'completed'
    tc.result = 'file contents'
    tc.completedAt = Date.now()

    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, { type: 'tool_call_completed', toolCall: tc })

    const output = renderApp(state)
    expect(output).toContain('Read(x.ts)')
    expect(output).toContain('Bash')
    expect(output).toContain('→')
  })

  it('renders safety blocked prominently', () => {
    const tc = createToolCallLifecycle({ id: 'tc-1', toolName: 'bash', args: { command: 'rm -rf /' }, command: 'rm -rf /' })
    tc.safety = { riskLevel: 'dangerous', allowed: false, ruleId: 'rm_rf', reason: 'destructive command' }
    tc.phase = 'blocked'
    tc.isError = true
    tc.result = 'BLOCKED'
    tc.completedAt = Date.now()

    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, { type: 'tool_call_completed', toolCall: tc })

    const output = renderApp(state)
    expect(output).toContain('BLOCKED')
    expect(output).toContain('dangerous')
  })

  it('renders displayReason when present', () => {
    const tc = createToolCallLifecycle({ id: 'tc-1', toolName: 'bash', args: { command: 'ls' }, command: 'ls' })
    tc.displayReason = 'checking project structure'
    tc.phase = 'executing'
    tc.executionStartedAt = Date.now()

    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: tc })

    const output = renderApp(state)
    expect(output).toContain('checking project structure')
  })

  it('renders completion with duration', () => {
    const tc = createToolCallLifecycle({ id: 'tc-1', toolName: 'bash', args: { command: 'echo hi' }, command: 'echo hi' })
    tc.phase = 'completed'
    tc.result = 'hi'
    tc.executionStartedAt = 1000
    tc.completedAt = 2500

    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, { type: 'tool_call_completed', toolCall: tc })

    const output = renderApp(state)
    expect(output).toContain('done')
    expect(output).toContain('1.5s')
  })
})

// ---------------------------------------------------------------------------
// 10. Session mode derivation
// ---------------------------------------------------------------------------

describe('Session mode in composer', () => {
  beforeEach(() => _resetProvisionalIdCounter())

  it('derives waiting_answer mode when last item is question', () => {
    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, {
      type: 'blocked_enter',
      reason: 'waiting_user',
      question: 'What?',
      timestamp: 1,
    })

    const output = renderToString(
      <App state={state} version="0.0.1" provider="test" model="test" maxSteps={10}
        inputActive={true} onInputSubmit={() => {}} />,
    )
    expect(output).toContain('answer the question')
  })

  it('derives interrupted mode when last item is interrupted status', () => {
    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, {
      type: 'blocked_enter',
      reason: 'interrupted',
      timestamp: 1,
    })

    const output = renderToString(
      <App state={state} version="0.0.1" provider="test" model="test" maxSteps={10}
        inputActive={true} onInputSubmit={() => {}} />,
    )
    expect(output).toContain('PAUSED')
    expect(output).toContain('continue')
  })

  it('shows working status when running', () => {
    const state: TimelineState = {
      ...createInitialTimelineState(),
      isRunning: true,
    }

    const output = renderToString(
      <App state={state} version="0.0.1" provider="test" model="test" maxSteps={10}
        inputActive={false} onInputSubmit={() => {}} />,
    )
    expect(output).toContain('working')
    expect(output).toContain('Ctrl+C')
  })
})

// ---------------------------------------------------------------------------
// 11. Operator console polish v2
// ---------------------------------------------------------------------------

describe('Thinking vs working convergence', () => {
  beforeEach(() => _resetProvisionalIdCounter())

  it('does not render raw thinking as large text block', () => {
    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })
    state = applyThinkingDelta(state, 'First I need to understand the codebase. Let me check the directory structure and find relevant files.')

    const output = renderApp(state)
    // Should NOT contain the full raw thinking text
    expect(output).not.toContain('Let me check the directory structure')
  })

  it('working status is the sole running indicator in composer', () => {
    const state: TimelineState = {
      ...createInitialTimelineState(),
      isRunning: true,
    }

    const output = renderToString(
      <App state={state} version="0.0.1" provider="test" model="test" maxSteps={10}
        inputActive={false} onInputSubmit={() => {}} />,
    )
    // Composer shows working — this is the authoritative running indicator
    expect(output).toContain('working')
  })
})

describe('Composer always visible', () => {
  beforeEach(() => _resetProvisionalIdCounter())

  it('composer is visible when running (not active but present)', () => {
    const state: TimelineState = {
      ...createInitialTimelineState(),
      isRunning: true,
    }

    const output = renderToString(
      <App state={state} version="0.0.1" provider="test" model="test" maxSteps={10}
        inputActive={false} onInputSubmit={() => {}} />,
    )
    // Prompt character should be visible even when disabled
    expect(output).toContain('>')
    expect(output).toContain('working')
  })

  it('composer shows prompt in idle mode', () => {
    const state = createInitialTimelineState(true)

    const output = renderToString(
      <App state={state} version="0.0.1" provider="test" model="test" maxSteps={10}
        inputActive={true} onInputSubmit={() => {}} />,
    )
    expect(output).toContain('>')
    expect(output).toContain('Enter to send')
  })
})

describe('User lane identity', () => {
  beforeEach(() => _resetProvisionalIdCounter())

  it('user items show YOU label', () => {
    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, { type: 'user_turn', id: 'u1', content: 'hello world', timestamp: 1 })

    const output = renderApp(state)
    expect(output).toContain('YOU')
    expect(output).toContain('hello world')
  })

  it('user and assistant items are visually distinct', () => {
    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, { type: 'user_turn', id: 'u1', content: 'my message', timestamp: 1 })
    state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 2 })
    state = applyTextDelta(state, 'assistant reply')
    state = reduceLifecycleEvent(state, { type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 3 })

    const output = renderApp(state)
    // User has YOU label, assistant does not
    expect(output).toContain('YOU')
    expect(output).toContain('my message')
    expect(output).toContain('assistant reply')
  })
})

describe('ToolCallCard progressive execution', () => {
  beforeEach(() => _resetProvisionalIdCounter())

  it('active tool card has left border', () => {
    const tc = createToolCallLifecycle({ id: 'tc-1', toolName: 'bash', args: { command: 'ls' }, command: 'ls' })
    tc.phase = 'executing'
    tc.executionStartedAt = Date.now()

    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: tc })

    const output = renderApp(state)
    // Active card uses thick border
    expect(output).toContain('┃')
  })

  it('completed tool card has dimmed border', () => {
    const tc = createToolCallLifecycle({ id: 'tc-1', toolName: 'bash', args: { command: 'echo hi' }, command: 'echo hi' })
    tc.phase = 'completed'
    tc.result = 'hi'
    tc.completedAt = Date.now()

    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, { type: 'tool_call_completed', toolCall: tc })

    const output = renderApp(state)
    // Completed card uses thin border
    expect(output).toContain('│')
  })
})

// ---------------------------------------------------------------------------
// 12. Queue input support
// ---------------------------------------------------------------------------

describe('Queue input during running', () => {
  beforeEach(() => _resetProvisionalIdCounter())

  it('composer is visible and active during running (for queue input)', () => {
    const state: TimelineState = {
      ...createInitialTimelineState(),
      isRunning: true,
    }

    const output = renderToString(
      <App state={state} version="0.0.1" provider="test" model="test" maxSteps={10}
        inputActive={true} onInputSubmit={() => {}} isRunning={true} />,
    )
    // Prompt should be visible
    expect(output).toContain('>')
    // Should show queue hint
    expect(output).toContain('queue')
  })

  it('shows pending queue count when messages are queued', () => {
    const state: TimelineState = {
      ...createInitialTimelineState(),
      isRunning: true,
    }

    const output = renderToString(
      <App state={state} version="0.0.1" provider="test" model="test" maxSteps={10}
        inputActive={true} onInputSubmit={() => {}} pendingQueue={['msg1', 'msg2']} isRunning={true} />,
    )
    expect(output).toContain('2 queued')
  })

  it('shows queue preview for pending messages', () => {
    const state: TimelineState = {
      ...createInitialTimelineState(),
      isRunning: true,
    }

    const output = renderToString(
      <App state={state} version="0.0.1" provider="test" model="test" maxSteps={10}
        inputActive={true} onInputSubmit={() => {}} pendingQueue={['fix the bug', 'then run tests']} isRunning={true} />,
    )
    expect(output).toContain('fix the bug')
    expect(output).toContain('then run tests')
  })

  it('queue preview truncates long messages', () => {
    const longMsg = 'A'.repeat(100)
    const state: TimelineState = {
      ...createInitialTimelineState(),
      isRunning: true,
    }

    const output = renderToString(
      <App state={state} version="0.0.1" provider="test" model="test" maxSteps={10}
        inputActive={true} onInputSubmit={() => {}} pendingQueue={[longMsg]} isRunning={true} />,
    )
    // Should be truncated with ellipsis
    expect(output).toContain('…')
    expect(output).not.toContain(longMsg)
  })

  it('empty queue shows no queue indicator', () => {
    const state: TimelineState = {
      ...createInitialTimelineState(),
      isRunning: true,
    }

    const output = renderToString(
      <App state={state} version="0.0.1" provider="test" model="test" maxSteps={10}
        inputActive={true} onInputSubmit={() => {}} pendingQueue={[]} isRunning={true} />,
    )
    expect(output).not.toContain('queued')
  })
})
