import { describe, it, expect, beforeEach } from 'vitest'
import {
  createInitialTimelineState,
  reduceLifecycleEvent,
  applyThinkingDelta,
  applyTextDelta,
} from '../src/renderer/ink/timeline-projection.js'
import type { TimelineState, AssistantItem, ToolCallItem, UserItem, QuestionItem, StatusItem } from '../src/renderer/ink/timeline-projection.js'
import { createToolCallLifecycle, _resetProvisionalIdCounter, createReasoningState } from '@agent/core'
import type { LifecycleEvent, ToolCallLifecycle, AssistantReasoningState } from '@agent/core'

describe('Timeline Projection', () => {
  beforeEach(() => {
    _resetProvisionalIdCounter()
  })

  describe('user_turn', () => {
    it('adds a user item to the timeline', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, {
        type: 'user_turn',
        id: 'user-1',
        content: 'hello',
        timestamp: 1000,
      })

      expect(state.items).toHaveLength(1)
      expect(state.items[0]!.type).toBe('user')
      expect((state.items[0] as UserItem).content).toBe('hello')
      expect(state.isRunning).toBe(true)
      expect(state.isIdle).toBe(false)
    })
  })

  describe('assistant_turn', () => {
    it('adds an assistant item on start, marks streaming', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, {
        type: 'assistant_turn_start',
        id: 'asst-1',
        reasoning: createReasoningState(),
        timestamp: 1000,
      })

      expect(state.items).toHaveLength(1)
      const item = state.items[0] as AssistantItem
      expect(item.type).toBe('assistant')
      expect(item.isStreaming).toBe(true)
      expect(item.reasoning).toBeDefined()
      expect(item.reasoning!.status).toBe('thinking')
    })

    it('marks streaming false on end and updates reasoning', () => {
      const reasoning = createReasoningState()
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'asst-1', reasoning, timestamp: 1000 })
      const endReasoning = { ...reasoning, rawThoughtText: 'done thinking', status: 'completed' as const }
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_end', id: 'asst-1', reasoning: endReasoning, timestamp: 2000 })

      const item = state.items[0] as AssistantItem
      expect(item.isStreaming).toBe(false)
      expect(item.reasoning!.rawThoughtText).toBe('done thinking')
      expect(item.reasoning!.status).toBe('completed')
    })
  })

  describe('raw stream deltas', () => {
    it('appends thinking delta to streaming assistant', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'asst-1', reasoning: createReasoningState(), timestamp: 1000 })
      state = applyThinkingDelta(state, 'hello ')
      state = applyThinkingDelta(state, 'world')

      const item = state.items[0] as AssistantItem
      expect(item.thinking).toBe('hello world')
    })

    it('appends text delta to streaming assistant', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'asst-1', reasoning: createReasoningState(), timestamp: 1000 })
      state = applyTextDelta(state, 'foo ')
      state = applyTextDelta(state, 'bar')

      const item = state.items[0] as AssistantItem
      expect(item.text).toBe('foo bar')
    })
  })

  describe('tool_call lifecycle', () => {
    it('creates a tool call item on tool_call_created', () => {
      let state = createInitialTimelineState()
      const tc = createToolCallLifecycle({ id: 'tc-1', toolName: 'bash', args: { command: 'ls' }, command: 'ls' })
      state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: tc })

      expect(state.items).toHaveLength(1)
      const item = state.items[0] as ToolCallItem
      expect(item.type).toBe('tool_call')
      expect(item.id).toBe('tc-1')
      expect(item.toolCall.phase).toBe('generating')
    })

    it('updates the same tool call item on tool_call_updated', () => {
      let state = createInitialTimelineState()
      const tc = createToolCallLifecycle({ id: 'tc-1', toolName: 'bash', args: { command: 'ls' }, command: 'ls' })
      state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: { ...tc } })

      tc.phase = 'executing'
      tc.stdout = 'file1.ts\n'
      state = reduceLifecycleEvent(state, { type: 'tool_call_updated', toolCall: { ...tc } })

      expect(state.items).toHaveLength(1)
      const item = state.items[0] as ToolCallItem
      expect(item.toolCall.phase).toBe('executing')
      expect(item.toolCall.stdout).toBe('file1.ts\n')
    })

    it('route and safety info are on the same tool call object', () => {
      let state = createInitialTimelineState()
      const tc = createToolCallLifecycle({ id: 'tc-1', toolName: 'file_read', args: { file_path: 'x' }, command: 'x' })
      tc.route = { wasRouted: true, ruleId: 'bash_cat_to_file_read', originalToolName: 'bash', originalArgs: { command: 'cat x' }, reason: 'routed' }
      tc.safety = { riskLevel: 'safe', allowed: true, ruleId: 'static_safe', reason: 'safe' }
      tc.phase = 'completed'
      tc.result = 'contents'
      tc.completedAt = Date.now()

      state = reduceLifecycleEvent(state, { type: 'tool_call_completed', toolCall: tc })

      const item = state.items[0] as ToolCallItem
      expect(item.toolCall.route?.wasRouted).toBe(true)
      expect(item.toolCall.safety?.riskLevel).toBe('safe')
      expect(item.toolCall.result).toBe('contents')
    })

    it('tool stdout/stderr streaming updates are reflected', () => {
      let state = createInitialTimelineState()
      const tc = createToolCallLifecycle({ id: 'tc-1', toolName: 'bash', args: { command: 'echo hi' }, command: 'echo hi' })
      tc.phase = 'executing'
      state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: { ...tc } })

      tc.stdout = 'hi\n'
      state = reduceLifecycleEvent(state, { type: 'tool_call_updated', toolCall: { ...tc } })

      const item = state.items[0] as ToolCallItem
      expect(item.toolCall.stdout).toBe('hi\n')
    })

    it('stable id — does not duplicate on update', () => {
      let state = createInitialTimelineState()
      const tc = createToolCallLifecycle({ id: 'tc-1', toolName: 'ls', args: {}, command: 'ls' })
      state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: { ...tc } })
      tc.phase = 'executing'
      state = reduceLifecycleEvent(state, { type: 'tool_call_updated', toolCall: { ...tc } })
      tc.phase = 'completed'
      tc.result = 'done'
      state = reduceLifecycleEvent(state, { type: 'tool_call_completed', toolCall: { ...tc } })

      expect(state.items).toHaveLength(1)
      expect((state.items[0] as ToolCallItem).toolCall.phase).toBe('completed')
    })
  })

  describe('blocked states', () => {
    it('waiting_user adds a question item', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, {
        type: 'blocked_enter',
        reason: 'waiting_user',
        question: 'What color?',
        timestamp: 1000,
      })

      expect(state.items).toHaveLength(1)
      expect(state.items[0]!.type).toBe('question')
      expect((state.items[0] as QuestionItem).question).toBe('What color?')
      expect(state.isRunning).toBe(false)
    })

    it('interrupted adds a status item', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, {
        type: 'blocked_enter',
        reason: 'interrupted',
        timestamp: 1000,
      })

      expect(state.items).toHaveLength(1)
      expect(state.items[0]!.type).toBe('status')
      expect((state.items[0] as StatusItem).status).toBe('interrupted')
    })
  })

  describe('session_done', () => {
    it('success does not add a status item (text already in AssistantItem)', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, {
        type: 'session_done',
        success: true,
        text: 'All done',
        timestamp: 1000,
      })

      expect(state.isRunning).toBe(false)
      // No status item for success — the text is already in the AssistantItem
      expect(state.items).toHaveLength(0)
    })

    it('error adds an error status item', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, {
        type: 'session_done',
        success: false,
        error: 'Max steps exceeded',
        timestamp: 1000,
      })

      const last = state.items[state.items.length - 1] as StatusItem
      expect(last.status).toBe('error')
      expect(last.message).toBe('Max steps exceeded')
    })
  })

  describe('ordering stability', () => {
    it('items appear in chronological order', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'user_turn', id: 'u1', content: 'hi', timestamp: 1 })
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 2 })
      const tc = createToolCallLifecycle({ id: 'tc-1', toolName: 'ls', args: {}, command: 'ls' })
      state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: tc })
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 3 })

      expect(state.items.map(i => i.type)).toEqual(['user', 'assistant', 'tool_call'])
    })
  })

  describe('reasoning state on timeline items', () => {
    it('assistant item carries reasoning state from turn start', () => {
      const reasoning = createReasoningState()
      reasoning.rawThoughtText = 'checking files'
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, {
        type: 'assistant_turn_start',
        id: 'a1',
        reasoning,
        timestamp: 1000,
      })

      const item = state.items[0] as AssistantItem
      expect(item.reasoning).toBeDefined()
      expect(item.reasoning!.rawThoughtText).toBe('checking files')
    })

    it('question item carries reasoning context from blocked_enter', () => {
      const reasoning = createReasoningState()
      reasoning.rawThoughtText = 'I need to ask about the color'
      reasoning.status = 'blocked'

      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, {
        type: 'blocked_enter',
        reason: 'waiting_user',
        question: 'What color?',
        reasoning,
        timestamp: 1000,
      })

      const item = state.items[0] as QuestionItem
      expect(item.reasoning).toBeDefined()
      expect(item.reasoning!.rawThoughtText).toContain('color')
    })

    it('question item works with null reasoning', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, {
        type: 'blocked_enter',
        reason: 'waiting_user',
        question: 'What?',
        timestamp: 1000,
      })

      const item = state.items[0] as QuestionItem
      expect(item.reasoning).toBeNull()
    })
  })
})
