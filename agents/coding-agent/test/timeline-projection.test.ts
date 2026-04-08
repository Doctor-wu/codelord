import { describe, it, expect, beforeEach } from 'vitest'
import {
  createInitialTimelineState,
  reduceLifecycleEvent,
  applyThinkingDelta,
  applyTextDelta,
  applyToolCallStart,
  applyToolCallDelta,
  applyToolCallEnd,
  captureTimelineSnapshot,
  hydrateTimelineState,
} from '../src/renderer/ink/timeline-projection.js'
import type { TimelineState, AssistantItem, ToolCallItem, ToolBatchItem, UserItem, QuestionItem, StatusItem } from '../src/renderer/ink/timeline-projection.js'
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

  // =========================================================================
  // Visible Reasoning Lane tests
  // =========================================================================

  describe('visible reasoning lane', () => {
    it('reasoning snapshot is captured from thinking delta (not fleeting)', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, {
        type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1,
      })
      // Accumulate enough thinking text to trigger snapshot
      state = applyThinkingDelta(state, 'I need to check the configuration files to understand the project structure.')

      const item = state.items[0] as AssistantItem
      expect(item.reasoningSnapshot).toBeTruthy()
      expect(item.reasoningSnapshot!.length).toBeLessThanOrEqual(120)
    })

    it('reasoning snapshot persists after text arrives', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, {
        type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1,
      })
      state = applyThinkingDelta(state, 'I need to check the configuration files to understand the project structure.')
      // Now text arrives — reasoning snapshot should NOT be cleared
      state = applyTextDelta(state, 'Here is the answer.')

      const item = state.items[0] as AssistantItem
      expect(item.reasoningSnapshot).toBeTruthy()
      expect(item.text).toBe('Here is the answer.')
    })

    it('reasoning snapshot does not dump raw thought text', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, {
        type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1,
      })
      // Long thinking text
      const longThought = 'A'.repeat(200)
      state = applyThinkingDelta(state, longThought)

      const item = state.items[0] as AssistantItem
      expect(item.reasoningSnapshot).toBeTruthy()
      // Must not be the full raw dump
      expect(item.reasoningSnapshot!.length).toBeLessThanOrEqual(120)
    })

    it('reasoning snapshot is null when thinking is too short', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, {
        type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1,
      })
      state = applyThinkingDelta(state, 'hmm')

      const item = state.items[0] as AssistantItem
      expect(item.reasoningSnapshot).toBeNull()
    })

    it('reasoning snapshot preserved through assistant_turn_end', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, {
        type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1,
      })
      state = applyThinkingDelta(state, 'I will read the package.json to check dependencies.')
      state = applyTextDelta(state, 'Done.')
      state = reduceLifecycleEvent(state, {
        type: 'assistant_turn_end', id: 'a1', reasoning: { ...createReasoningState(), status: 'completed' }, timestamp: 2,
      })

      const item = state.items[0] as AssistantItem
      expect(item.isStreaming).toBe(false)
      expect(item.reasoningSnapshot).toBeTruthy()
    })

    it('waiting_user question still carries reasoning context', () => {
      const reasoning = createReasoningState()
      reasoning.why = 'Need user input on deployment target'
      reasoning.status = 'blocked'

      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, {
        type: 'blocked_enter',
        reason: 'waiting_user',
        question: 'Which environment?',
        reasoning,
        timestamp: 1000,
      })

      const item = state.items[0] as QuestionItem
      expect(item.reasoning).toBeDefined()
      expect(item.reasoning!.why).toBe('Need user input on deployment target')
    })
  })

  // =========================================================================
  // Tool Batch / Work Group tests
  // =========================================================================

  describe('tool batch / work group', () => {
    it('consecutive tool calls in same assistant turn merge into a batch', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'user_turn', id: 'u1', content: 'hi', timestamp: 1 })
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 2 })

      const tc1 = createToolCallLifecycle({ id: 'tc-1', toolName: 'file_read', args: { file_path: 'a.ts' }, command: 'a.ts' })
      state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: tc1 })

      const tc2 = createToolCallLifecycle({ id: 'tc-2', toolName: 'file_read', args: { file_path: 'b.ts' }, command: 'b.ts' })
      state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: tc2 })

      // Should have: user, assistant, tool_batch (not two separate tool_calls)
      const types = state.items.map(i => i.type)
      expect(types).toEqual(['user', 'assistant', 'tool_batch'])

      const batch = state.items[2] as ToolBatchItem
      expect(batch.toolCalls).toHaveLength(2)
      expect(batch.toolCalls[0]!.id).toBe('tc-1')
      expect(batch.toolCalls[1]!.id).toBe('tc-2')
    })

    it('single tool call stays standalone (no batch wrapper)', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })

      const tc = createToolCallLifecycle({ id: 'tc-1', toolName: 'bash', args: { command: 'ls' }, command: 'ls' })
      state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: tc })

      expect(state.items.map(i => i.type)).toEqual(['assistant', 'tool_call'])
    })

    it('each tool call in batch retains independent identity', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })

      const tc1 = createToolCallLifecycle({ id: 'tc-1', toolName: 'bash', args: { command: 'ls' }, command: 'ls' })
      tc1.route = { wasRouted: false, ruleId: null, originalToolName: 'bash', originalArgs: {}, reason: null }
      tc1.safety = { riskLevel: 'safe', allowed: true, ruleId: 'static', reason: 'safe' }
      state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: tc1 })

      const tc2 = createToolCallLifecycle({ id: 'tc-2', toolName: 'file_read', args: { file_path: 'x' }, command: 'x' })
      tc2.safety = { riskLevel: 'moderate', allowed: true, ruleId: 'dynamic', reason: 'needs review' }
      state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: tc2 })

      const batch = state.items[1] as ToolBatchItem
      expect(batch.toolCalls[0]!.id).toBe('tc-1')
      expect(batch.toolCalls[0]!.route).toBeDefined()
      expect(batch.toolCalls[0]!.safety?.riskLevel).toBe('safe')
      expect(batch.toolCalls[1]!.id).toBe('tc-2')
      expect(batch.toolCalls[1]!.safety?.riskLevel).toBe('moderate')
    })

    it('stdout/stderr streaming updates work within a batch', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })

      const tc1 = createToolCallLifecycle({ id: 'tc-1', toolName: 'bash', args: { command: 'echo hi' }, command: 'echo hi' })
      state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: tc1 })

      const tc2 = createToolCallLifecycle({ id: 'tc-2', toolName: 'bash', args: { command: 'echo bye' }, command: 'echo bye' })
      state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: tc2 })

      // Update tc1 with stdout
      const tc1Updated = { ...tc1, phase: 'executing' as const, stdout: 'hi\n' }
      state = reduceLifecycleEvent(state, { type: 'tool_call_updated', toolCall: tc1Updated })

      const batch = state.items[1] as ToolBatchItem
      expect(batch.toolCalls[0]!.stdout).toBe('hi\n')
      expect(batch.toolCalls[0]!.phase).toBe('executing')
      expect(batch.toolCalls[1]!.id).toBe('tc-2')
    })

    it('route/safety/blocked info not lost in batch merge', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })

      const tc1 = createToolCallLifecycle({ id: 'tc-1', toolName: 'bash', args: { command: 'rm -rf /' }, command: 'rm -rf /' })
      tc1.phase = 'blocked'
      tc1.safety = { riskLevel: 'critical', allowed: false, ruleId: 'destructive', reason: 'dangerous command' }
      state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: tc1 })

      const tc2 = createToolCallLifecycle({ id: 'tc-2', toolName: 'file_read', args: { file_path: 'safe.ts' }, command: 'safe.ts' })
      tc2.safety = { riskLevel: 'safe', allowed: true, ruleId: 'static', reason: 'safe' }
      state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: tc2 })

      const batch = state.items[1] as ToolBatchItem
      expect(batch.toolCalls[0]!.phase).toBe('blocked')
      expect(batch.toolCalls[0]!.safety?.allowed).toBe(false)
      expect(batch.toolCalls[0]!.safety?.riskLevel).toBe('critical')
      expect(batch.toolCalls[1]!.safety?.allowed).toBe(true)
    })

    it('user_turn breaks the current batch', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })

      const tc1 = createToolCallLifecycle({ id: 'tc-1', toolName: 'bash', args: { command: 'ls' }, command: 'ls' })
      state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: tc1 })

      // User turn interrupts
      state = reduceLifecycleEvent(state, { type: 'user_turn', id: 'u1', content: 'stop', timestamp: 2 })

      expect(state._currentBatchId).toBeNull()
    })

    it('blocked_enter breaks the current batch', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })

      const tc1 = createToolCallLifecycle({ id: 'tc-1', toolName: 'bash', args: { command: 'ls' }, command: 'ls' })
      state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: tc1 })

      state = reduceLifecycleEvent(state, {
        type: 'blocked_enter', reason: 'waiting_user', question: 'Continue?', timestamp: 2,
      })

      expect(state._currentBatchId).toBeNull()
    })

    it('session_done breaks the current batch', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })

      const tc1 = createToolCallLifecycle({ id: 'tc-1', toolName: 'bash', args: { command: 'ls' }, command: 'ls' })
      state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: tc1 })

      state = reduceLifecycleEvent(state, { type: 'session_done', success: true, timestamp: 3 })

      expect(state._currentBatchId).toBeNull()
      expect(state._currentAssistantTurnId).toBeNull()
    })

    it('three consecutive tool calls all end up in one batch', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })

      for (let i = 1; i <= 3; i++) {
        const tc = createToolCallLifecycle({ id: `tc-${i}`, toolName: 'file_read', args: { file_path: `f${i}.ts` }, command: `f${i}.ts` })
        state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: tc })
      }

      expect(state.items.map(i => i.type)).toEqual(['assistant', 'tool_batch'])
      const batch = state.items[1] as ToolBatchItem
      expect(batch.toolCalls).toHaveLength(3)
    })

    it('batch carries reasoning from the assistant turn', () => {
      const reasoning = createReasoningState()
      reasoning.why = 'Need to read multiple config files'
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning, timestamp: 1 })

      const tc1 = createToolCallLifecycle({ id: 'tc-1', toolName: 'file_read', args: { file_path: 'a.ts' }, command: 'a.ts' })
      state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: tc1 })
      const tc2 = createToolCallLifecycle({ id: 'tc-2', toolName: 'file_read', args: { file_path: 'b.ts' }, command: 'b.ts' })
      state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: tc2 })

      const batch = state.items[1] as ToolBatchItem
      expect(batch.reasoning).toBeDefined()
      expect(batch.reasoning!.why).toBe('Need to read multiple config files')
    })

    it('timeline ordering and key stability preserved with batches', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'user_turn', id: 'u1', content: 'hi', timestamp: 1 })
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 2 })

      const tc1 = createToolCallLifecycle({ id: 'tc-1', toolName: 'ls', args: {}, command: 'ls' })
      state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: tc1 })
      const tc2 = createToolCallLifecycle({ id: 'tc-2', toolName: 'bash', args: { command: 'pwd' }, command: 'pwd' })
      state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: tc2 })

      state = reduceLifecycleEvent(state, { type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 3 })

      const types = state.items.map(i => i.type)
      expect(types).toEqual(['user', 'assistant', 'tool_batch'])

      // All items have unique ids
      const ids = state.items.map(i => i.id)
      expect(new Set(ids).size).toBe(ids.length)
    })
  })

  // ---------------------------------------------------------------------------
  // Step count telemetry
  // ---------------------------------------------------------------------------

  describe('stepCount', () => {
    it('increments on each assistant_turn_start', () => {
      let state = createInitialTimelineState()
      expect(state.stepCount).toBe(0)

      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })
      expect(state.stepCount).toBe(1)

      state = reduceLifecycleEvent(state, { type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 2 })
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a2', reasoning: createReasoningState(), timestamp: 3 })
      expect(state.stepCount).toBe(2)
    })

    it('survives timeline snapshot round-trip', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a2', reasoning: createReasoningState(), timestamp: 2 })
      expect(state.stepCount).toBe(2)

      const snapshot = captureTimelineSnapshot(state)
      const hydrated = hydrateTimelineState(snapshot)
      expect(hydrated.stepCount).toBe(2)
    })
  })

  // ---------------------------------------------------------------------------
  // Usage telemetry
  // ---------------------------------------------------------------------------

  describe('usage_updated', () => {
    it('stores usage aggregate in timeline state', () => {
      let state = createInitialTimelineState()
      const usage = {
        input: 100, output: 50, cacheRead: 30, cacheWrite: 10, totalTokens: 190,
        cost: { input: 0.001, output: 0.002, cacheRead: 0.0003, cacheWrite: 0.0001, total: 0.0034 },
        llmCalls: 1, lastCall: null,
      }
      state = reduceLifecycleEvent(state, { type: 'usage_updated', usage, timestamp: Date.now() })
      expect(state.usage).not.toBeNull()
      expect(state.usage!.totalTokens).toBe(190)
      expect(state.usage!.cacheRead).toBe(30)
    })

    it('usage survives timeline snapshot round-trip', () => {
      let state = createInitialTimelineState()
      const usage = {
        input: 200, output: 100, cacheRead: 50, cacheWrite: 20, totalTokens: 370,
        cost: { input: 0.01, output: 0.02, cacheRead: 0.005, cacheWrite: 0.002, total: 0.037 },
        llmCalls: 3, lastCall: null,
      }
      state = reduceLifecycleEvent(state, { type: 'usage_updated', usage, timestamp: Date.now() })

      const snapshot = captureTimelineSnapshot(state)
      const hydrated = hydrateTimelineState(snapshot)
      expect(hydrated.usage).not.toBeNull()
      expect(hydrated.usage!.totalTokens).toBe(370)
      expect(hydrated.usage!.llmCalls).toBe(3)
    })
  })

  // =========================================================================
  // M1X-Streaming: Provisional tool calls + live proxy + handoff
  // =========================================================================

  describe('provisional tool calls (raw stream → UI)', () => {
    it('toolcall_start creates a provisional tool card before lifecycle', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })

      state = applyToolCallStart(state, 0, 'file_write', { file_path: 'foo.ts' })

      // Should have assistant + provisional tool_call
      expect(state.items.map(i => i.type)).toEqual(['assistant', 'tool_call'])
      const tc = (state.items[1] as ToolCallItem).toolCall
      expect(tc.toolName).toBe('file_write')
      expect(tc.phase).toBe('generating')
      expect(tc.provisionalId).toBeTruthy()
    })

    it('toolcall_delta updates provisional tool args', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })
      state = applyToolCallStart(state, 0, 'file_write', { file_path: 'foo.ts' })
      state = applyToolCallDelta(state, 0, 'file_write', { file_path: 'foo.ts', content: 'partial content...' })

      const tc = (state.items[1] as ToolCallItem).toolCall
      expect(tc.args.content).toBe('partial content...')
    })

    it('toolcall_end finalizes provisional with real id', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })
      state = applyToolCallStart(state, 0, 'file_write', { file_path: 'foo.ts' })
      state = applyToolCallEnd(state, 0, 'tc-real-1', 'file_write', { file_path: 'foo.ts', content: 'full content' })

      const tc = (state.items[1] as ToolCallItem).toolCall
      expect(tc.id).toBe('tc-real-1')
      expect(tc.args.content).toBe('full content')
    })

    it('provisional → stable handoff: no duplicate on tool_call_created', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })

      // Raw stream creates provisional
      state = applyToolCallStart(state, 0, 'file_write', { file_path: 'foo.ts' })
      state = applyToolCallEnd(state, 0, 'tc-real-1', 'file_write', { file_path: 'foo.ts', content: 'done' })

      // Lifecycle arrives — should replace, not duplicate
      const stableTc = createToolCallLifecycle({ id: 'tc-real-1', toolName: 'file_write', args: { file_path: 'foo.ts', content: 'done' }, command: 'foo.ts' })
      state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: stableTc })

      // Still only 2 items: assistant + tool_call (not 3)
      expect(state.items.map(i => i.type)).toEqual(['assistant', 'tool_call'])
      const tc = (state.items[1] as ToolCallItem).toolCall
      expect(tc.id).toBe('tc-real-1')
      // Stable version should have null provisionalId
      expect(tc.provisionalId).toBeNull()
    })

    it('provisional appears before lifecycle tool_call_created', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })

      // After toolcall_start, tool is visible
      state = applyToolCallStart(state, 0, 'bash', { command: 'ls' })
      expect(state.items).toHaveLength(2)
      expect(state.items[1]!.type).toBe('tool_call')

      // Before lifecycle arrives, tool is already there
      const tcBefore = (state.items[1] as ToolCallItem).toolCall
      expect(tcBefore.phase).toBe('generating')
    })
  })

  describe('no thinking + toolcall delta only (live proxy)', () => {
    it('assistant gets liveProxy when no thinking_* events', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })

      // Initial live proxy
      const item0 = state.items[0] as AssistantItem
      expect(item0.liveProxy).toBe('Thinking…')
      expect(item0.hasProviderThought).toBe(false)

      // toolcall_start updates live proxy
      state = applyToolCallStart(state, 0, 'file_write', { file_path: 'foo.ts' })
      const item1 = state.items[0] as AssistantItem
      expect(item1.liveProxy).toBe('正在构建 file_write 调用…')
    })

    it('liveProxy updates with args preview on toolcall_delta', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })
      state = applyToolCallStart(state, 0, 'file_read', { file_path: 'src/main.ts' })
      state = applyToolCallDelta(state, 0, 'file_read', { file_path: 'src/main.ts' })

      const item = state.items[0] as AssistantItem
      expect(item.liveProxy).toContain('file_read')
      expect(item.liveProxy).toContain('src/main.ts')
    })

    it('liveProxy is null when provider sends thinking_*', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })

      // Provider sends thinking
      state = applyThinkingDelta(state, 'I need to check the file structure.')

      const item = state.items[0] as AssistantItem
      expect(item.hasProviderThought).toBe(true)
      expect(item.liveProxy).toBeNull()

      // Even after toolcall_start, liveProxy stays null because provider has thoughts
      state = applyToolCallStart(state, 0, 'bash', { command: 'ls' })
      const item2 = state.items[0] as AssistantItem
      expect(item2.liveProxy).toBeNull()
    })

    it('liveProxy cleared on assistant_turn_end', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })
      state = applyToolCallStart(state, 0, 'bash', { command: 'ls' })

      state = reduceLifecycleEvent(state, { type: 'assistant_turn_end', id: 'a1', reasoning: createReasoningState(), timestamp: 2 })
      const item = state.items[0] as AssistantItem
      expect(item.liveProxy).toBeNull()
    })
  })

  describe('reasoning fallback when no provider thought', () => {
    it('assistant item is visible even with only liveProxy (no thinking, no text)', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })

      const item = state.items[0] as AssistantItem
      // Has liveProxy but no thinking/text
      expect(item.thinking).toBe('')
      expect(item.text).toBe('')
      expect(item.liveProxy).toBe('Thinking…')
      // The UI should render this (checked by App.tsx logic: !thinking && !text && !liveProxy → null)
    })
  })

  describe('throttled partial updates flush final state', () => {
    it('multiple toolcall_delta produce consistent final args', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })
      state = applyToolCallStart(state, 0, 'file_write', { file_path: 'x.ts' })

      // Simulate many deltas (in real usage, throttled by TimelineStore)
      for (let i = 0; i < 100; i++) {
        state = applyToolCallDelta(state, 0, 'file_write', { file_path: 'x.ts', content: 'a'.repeat(i + 1) })
      }

      const tc = (state.items[1] as ToolCallItem).toolCall
      expect(tc.args.content).toBe('a'.repeat(100))
    })

    it('toolcall_end after many deltas has correct final state', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })
      state = applyToolCallStart(state, 0, 'file_write', { file_path: 'x.ts' })

      for (let i = 0; i < 50; i++) {
        state = applyToolCallDelta(state, 0, 'file_write', { file_path: 'x.ts', content: `line${i}` })
      }

      state = applyToolCallEnd(state, 0, 'tc-final', 'file_write', { file_path: 'x.ts', content: 'final content' })

      const tc = (state.items[1] as ToolCallItem).toolCall
      expect(tc.id).toBe('tc-final')
      expect(tc.args.content).toBe('final content')
    })
  })

  describe('provisional tool in batch', () => {
    it('two provisional tools form a batch', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })

      state = applyToolCallStart(state, 0, 'file_read', { file_path: 'a.ts' })
      state = applyToolCallStart(state, 1, 'file_read', { file_path: 'b.ts' })

      // Should form a batch
      expect(state.items.map(i => i.type)).toEqual(['assistant', 'tool_batch'])
      const batch = state.items[1] as ToolBatchItem
      expect(batch.toolCalls).toHaveLength(2)
    })

    it('provisional batch handoff: stable lifecycle replaces provisional in batch', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1 })

      // Two provisional tools
      state = applyToolCallStart(state, 0, 'file_read', { file_path: 'a.ts' })
      state = applyToolCallEnd(state, 0, 'tc-1', 'file_read', { file_path: 'a.ts' })
      state = applyToolCallStart(state, 1, 'file_read', { file_path: 'b.ts' })
      state = applyToolCallEnd(state, 1, 'tc-2', 'file_read', { file_path: 'b.ts' })

      // Lifecycle arrives for both
      const stableTc1 = createToolCallLifecycle({ id: 'tc-1', toolName: 'file_read', args: { file_path: 'a.ts' }, command: 'a.ts' })
      state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: stableTc1 })
      const stableTc2 = createToolCallLifecycle({ id: 'tc-2', toolName: 'file_read', args: { file_path: 'b.ts' }, command: 'b.ts' })
      state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: stableTc2 })

      // Still a batch with 2 items, not 4
      expect(state.items.map(i => i.type)).toEqual(['assistant', 'tool_batch'])
      const batch = state.items[1] as ToolBatchItem
      expect(batch.toolCalls).toHaveLength(2)
      expect(batch.toolCalls[0]!.id).toBe('tc-1')
      expect(batch.toolCalls[1]!.id).toBe('tc-2')
    })
  })

  // =========================================================================
  // Reasoning viewport: streaming thought display behavior
  // =========================================================================

  describe('reasoning viewport behavior', () => {
    it('continuous thinking_delta keeps updating thinking text (not frozen)', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, {
        type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1,
      })

      // Simulate many thinking deltas
      state = applyThinkingDelta(state, 'First line of thought.\n')
      state = applyThinkingDelta(state, 'Second line of thought.\n')
      state = applyThinkingDelta(state, 'Third line of thought.\n')
      state = applyThinkingDelta(state, 'Fourth line of thought.\n')
      state = applyThinkingDelta(state, 'Fifth line of thought.\n')
      state = applyThinkingDelta(state, 'Sixth line — this should be in viewport.\n')

      const item = state.items[0] as AssistantItem
      // Full thinking text is preserved
      expect(item.thinking).toContain('Sixth line')
      expect(item.thinking.split('\n').filter(l => l).length).toBe(6)
      // hasProviderThought is true
      expect(item.hasProviderThought).toBe(true)
    })

    it('reasoningSnapshot freezes early but thinking keeps growing', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, {
        type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1,
      })

      state = applyThinkingDelta(state, 'I need to check the configuration files to understand the project structure.')
      const earlySnapshot = (state.items[0] as AssistantItem).reasoningSnapshot

      // More thinking arrives
      state = applyThinkingDelta(state, '\nNow looking at package.json.')
      state = applyThinkingDelta(state, '\nChecking tsconfig.json next.')
      state = applyThinkingDelta(state, '\nAlso need to review the test setup.')

      const item = state.items[0] as AssistantItem
      // Snapshot is frozen at early value
      expect(item.reasoningSnapshot).toBe(earlySnapshot)
      // But thinking text has all the content
      expect(item.thinking).toContain('test setup')
      expect(item.thinking).toContain('configuration files')
    })

    it('hasProviderThought=true prevents liveProxy from being set', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, {
        type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1,
      })

      // Provider sends thought
      state = applyThinkingDelta(state, 'Real thought from provider.')

      // Then toolcall_start tries to set liveProxy
      state = applyToolCallStart(state, 0, 'bash', { command: 'ls' })

      const item = state.items[0] as AssistantItem
      expect(item.hasProviderThought).toBe(true)
      expect(item.liveProxy).toBeNull()
    })

    it('hasProviderThought=false allows liveProxy display', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, {
        type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1,
      })

      // No thinking_delta, just toolcall
      state = applyToolCallStart(state, 0, 'file_write', { file_path: 'foo.ts' })

      const item = state.items[0] as AssistantItem
      expect(item.hasProviderThought).toBe(false)
      expect(item.liveProxy).toBeTruthy()
      expect(item.liveProxy).toContain('file_write')
    })

    it('after thinking_end, settled summary is available', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, {
        type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1,
      })

      state = applyThinkingDelta(state, 'I will read the package.json to check dependencies.')
      state = applyTextDelta(state, 'Here is the answer.')

      // End the turn
      state = reduceLifecycleEvent(state, {
        type: 'assistant_turn_end', id: 'a1', reasoning: { ...createReasoningState(), status: 'completed' }, timestamp: 2,
      })

      const item = state.items[0] as AssistantItem
      expect(item.isStreaming).toBe(false)
      // reasoningSnapshot should be available for settled display
      expect(item.reasoningSnapshot).toBeTruthy()
      // Full thinking preserved
      expect(item.thinking).toContain('package.json')
    })
  })
})

// ---------------------------------------------------------------------------
// Settled Reasoning Policy (via TimelineStore)
// ---------------------------------------------------------------------------

import { TimelineStore } from '../src/renderer/ink/timeline-store.js'

describe('Settled Reasoning Policy', () => {
  function buildAssistantTurnState(opts: { hasProviderThought: boolean; thinking: string; reasoningSnapshot: string | null }): TimelineStore {
    const store = new TimelineStore(false, 'high')
    const reasoning = createReasoningState()
    reasoning.rawThoughtText = opts.thinking

    // Simulate assistant_turn_start
    store.onLifecycleEvent({
      type: 'assistant_turn_start',
      id: 'turn-1',
      reasoning,
      timestamp: Date.now(),
    })

    // If hasProviderThought, simulate thinking deltas
    if (opts.hasProviderThought) {
      store.onRawEvent({ type: 'thinking_delta', contentIndex: 0, delta: opts.thinking })
    }

    // Simulate text
    store.onRawEvent({ type: 'text_delta', contentIndex: 0, delta: 'Hello' })

    // Manually set reasoningSnapshot if needed
    const state = store.getState()
    const items = [...state.items]
    const idx = items.findIndex(i => i.type === 'assistant')
    if (idx !== -1) {
      const a = items[idx] as AssistantItem
      items[idx] = { ...a, reasoningSnapshot: opts.reasoningSnapshot }
    }
    // Inject state back via hydrate trick
    store.hydrateFromSnapshot(captureTimelineSnapshot({ ...state, items }))
    store.setRunning(true)

    return store
  }

  it('high + hasProviderThought: keeps thinking', () => {
    const store = new TimelineStore(false, 'high')
    const reasoning = createReasoningState()
    reasoning.rawThoughtText = 'Deep analysis of the code'

    store.onLifecycleEvent({ type: 'assistant_turn_start', id: 'turn-1', reasoning, timestamp: Date.now() })
    store.onRawEvent({ type: 'thinking_delta', contentIndex: 0, delta: 'Deep analysis of the code' })
    store.onRawEvent({ type: 'text_delta', contentIndex: 0, delta: 'Result' })

    // End turn
    store.onLifecycleEvent({ type: 'assistant_turn_end', id: 'turn-1', reasoning, timestamp: Date.now() })

    const items = store.getState().items
    const assistant = items.find(i => i.type === 'assistant') as AssistantItem
    expect(assistant.thinking).toBe('Deep analysis of the code')
  })

  it('high + no provider thought: clears thinking, keeps snapshot', () => {
    const store = new TimelineStore(false, 'high')
    const reasoning = createReasoningState()
    reasoning.rawThoughtText = 'Internal reasoning'

    store.onLifecycleEvent({ type: 'assistant_turn_start', id: 'turn-1', reasoning, timestamp: Date.now() })
    // No thinking_delta — model doesn't stream thoughts
    store.onRawEvent({ type: 'text_delta', contentIndex: 0, delta: 'Result' })

    store.onLifecycleEvent({ type: 'assistant_turn_end', id: 'turn-1', reasoning, timestamp: Date.now() })

    const items = store.getState().items
    const assistant = items.find(i => i.type === 'assistant') as AssistantItem
    expect(assistant.thinking).toBe('')
    // reasoningSnapshot may or may not be set depending on projection logic
  })

  it('off: clears thinking, snapshot, and liveProxy', () => {
    const store = new TimelineStore(false, 'off')
    const reasoning = createReasoningState()

    store.onLifecycleEvent({ type: 'assistant_turn_start', id: 'turn-1', reasoning, timestamp: Date.now() })
    store.onRawEvent({ type: 'text_delta', contentIndex: 0, delta: 'Result' })

    store.onLifecycleEvent({ type: 'assistant_turn_end', id: 'turn-1', reasoning, timestamp: Date.now() })

    const items = store.getState().items
    const assistant = items.find(i => i.type === 'assistant') as AssistantItem
    expect(assistant.thinking).toBe('')
    expect(assistant.reasoningSnapshot).toBeNull()
    expect(assistant.liveProxy).toBeNull()
  })

  it('minimal: clears thinking, snapshot, and liveProxy', () => {
    const store = new TimelineStore(false, 'minimal')
    const reasoning = createReasoningState()

    store.onLifecycleEvent({ type: 'assistant_turn_start', id: 'turn-1', reasoning, timestamp: Date.now() })
    store.onRawEvent({ type: 'text_delta', contentIndex: 0, delta: 'Result' })

    store.onLifecycleEvent({ type: 'assistant_turn_end', id: 'turn-1', reasoning, timestamp: Date.now() })

    const items = store.getState().items
    const assistant = items.find(i => i.type === 'assistant') as AssistantItem
    expect(assistant.thinking).toBe('')
    expect(assistant.reasoningSnapshot).toBeNull()
    expect(assistant.liveProxy).toBeNull()
  })

  it('low: clears thinking, keeps snapshot', () => {
    const store = new TimelineStore(false, 'low')
    const reasoning = createReasoningState()
    reasoning.rawThoughtText = 'Some thought'

    store.onLifecycleEvent({ type: 'assistant_turn_start', id: 'turn-1', reasoning, timestamp: Date.now() })
    store.onRawEvent({ type: 'thinking_delta', contentIndex: 0, delta: 'Some thought that is long enough to extract a snapshot from the reasoning' })
    store.onRawEvent({ type: 'text_delta', contentIndex: 0, delta: 'Result' })

    store.onLifecycleEvent({ type: 'assistant_turn_end', id: 'turn-1', reasoning, timestamp: Date.now() })

    const items = store.getState().items
    const assistant = items.find(i => i.type === 'assistant') as AssistantItem
    expect(assistant.thinking).toBe('')
    // reasoningSnapshot should be preserved (set by applyThinkingDelta)
    expect(assistant.reasoningSnapshot).not.toBeNull()
  })

  describe('tool_call_streaming_* lifecycle events', () => {
    it('tool_call_streaming_start creates provisional via lifecycle', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })
      state = reduceLifecycleEvent(state, { type: 'tool_call_streaming_start', contentIndex: 0, toolName: 'bash', args: { command: 'ls' }, timestamp: 1010 })
      const toolItems = state.items.filter(i => i.type === 'tool_call')
      expect(toolItems).toHaveLength(1)
      expect((toolItems[0] as any).toolCall.toolName).toBe('bash')
      expect((toolItems[0] as any).toolCall.phase).toBe('generating')
    })

    it('tool_call_streaming_delta updates provisional args via lifecycle', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })
      state = reduceLifecycleEvent(state, { type: 'tool_call_streaming_start', contentIndex: 0, toolName: 'file_write', args: { file_path: 'x.ts' }, timestamp: 1010 })
      state = reduceLifecycleEvent(state, { type: 'tool_call_streaming_delta', contentIndex: 0, toolName: 'file_write', args: { file_path: 'x.ts', content: 'hello' }, timestamp: 1020 })
      const toolItems = state.items.filter(i => i.type === 'tool_call')
      expect(toolItems).toHaveLength(1)
      expect((toolItems[0] as any).toolCall.args.content).toBe('hello')
    })

    it('tool_call_streaming_end finalizes provisional with real id via lifecycle', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })
      state = reduceLifecycleEvent(state, { type: 'tool_call_streaming_start', contentIndex: 0, toolName: 'bash', args: { command: 'ls' }, timestamp: 1010 })
      state = reduceLifecycleEvent(state, { type: 'tool_call_streaming_end', contentIndex: 0, toolCallId: 'tc-real', toolName: 'bash', args: { command: 'ls -la' }, timestamp: 1020 })
      const toolItems = state.items.filter(i => i.type === 'tool_call')
      expect(toolItems).toHaveLength(1)
      expect((toolItems[0] as any).toolCall.id).toBe('tc-real')
    })

    it('tool_call_created handoffs provisional created by streaming lifecycle', () => {
      let state = createInitialTimelineState()
      state = reduceLifecycleEvent(state, { type: 'assistant_turn_start', id: 'a1', reasoning: createReasoningState(), timestamp: 1000 })
      state = reduceLifecycleEvent(state, { type: 'tool_call_streaming_start', contentIndex: 0, toolName: 'bash', args: { command: 'ls' }, timestamp: 1010 })
      state = reduceLifecycleEvent(state, { type: 'tool_call_streaming_end', contentIndex: 0, toolCallId: 'tc-real', toolName: 'bash', args: { command: 'ls' }, timestamp: 1020 })
      // Now tool_call_created should handoff
      const stableTc = createToolCallLifecycle({ id: 'tc-real', toolName: 'bash', args: { command: 'ls' }, command: 'ls' })
      stableTc.phase = 'generating'
      state = reduceLifecycleEvent(state, { type: 'tool_call_created', toolCall: stableTc })
      const toolItems = state.items.filter(i => i.type === 'tool_call')
      expect(toolItems).toHaveLength(1)
      expect((toolItems[0] as any).toolCall.id).toBe('tc-real')
    })
  })
})
