import { describe, it, expect, beforeEach } from 'vitest'
import {
  createInitialTimelineState,
  reduceLifecycleEvent,
  applyThinkingDelta,
  applyTextDelta,
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
})
