import { afterEach, describe, expect, it, vi } from 'vitest'

const { streamSimpleMock } = vi.hoisted(() => ({
  streamSimpleMock: vi.fn(),
}))

vi.mock('@mariozechner/pi-ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mariozechner/pi-ai')>()
  return {
    ...actual,
    streamSimple: streamSimpleMock,
  }
})

import { AgentRuntime } from '../src/runtime.js'
import { ToolRouter } from '../src/tool-router.js'
import { ToolSafetyPolicy } from '../src/tool-safety.js'
import type { ToolHandler } from '../src/react-loop.js'
import type { LifecycleEvent } from '../src/events.js'

function makeAssistantMessage(overrides = {}) {
  return {
    role: 'assistant',
    content: [],
    stopReason: 'stop',
    timestamp: Date.now(),
    ...overrides,
  }
}

function makeEventStream(events: unknown[], resultMessage = makeAssistantMessage()) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event
      }
    },
    async result() {
      return resultMessage
    },
  }
}

describe('Event Spine — lifecycle events from runtime', () => {
  afterEach(() => {
    streamSimpleMock.mockReset()
  })

  it('emits user_turn when pending messages are drained during run()', async () => {
    const lifecycleEvents: LifecycleEvent[] = []
    const rt = new AgentRuntime({
      model: { id: 'test' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map(),
      apiKey: 'test',
      onLifecycleEvent: (e) => lifecycleEvents.push(e),
    })

    rt.enqueueUserMessage('hello')

    // user_turn is NOT emitted on enqueue — only when drained during run()
    expect(lifecycleEvents.filter(e => e.type === 'user_turn')).toHaveLength(0)

    const msg = makeAssistantMessage({ content: [{ type: 'text', text: 'hi' }] })
    streamSimpleMock.mockReturnValueOnce(makeEventStream([{ type: 'done', message: msg }], msg))
    await rt.run()

    const userTurns = lifecycleEvents.filter(e => e.type === 'user_turn')
    expect(userTurns).toHaveLength(1)
    if (userTurns[0]!.type === 'user_turn') {
      expect(userTurns[0]!.content).toBe('hello')
    }
  })

  it('emits assistant_turn_start/end and tool_call lifecycle for a tool call', async () => {
    const lifecycleEvents: LifecycleEvent[] = []
    const router = new ToolRouter()
    const safetyPolicy = new ToolSafetyPolicy({ cwd: '/tmp' })

    const handler: ToolHandler = vi.fn(async (_args, ctx) => {
      ctx.emitOutput('stdout', 'output-chunk')
      return { output: 'done', isError: false }
    })

    const toolCall = {
      type: 'toolCall',
      id: 'tc-1',
      name: 'file_read',
      arguments: { file_path: 'foo.ts' },
    }

    const assistantWithTool = makeAssistantMessage({
      content: [toolCall],
      stopReason: 'toolUse',
    })

    const finalAssistant = makeAssistantMessage({
      content: [{ type: 'text', text: 'Done' }],
    })

    streamSimpleMock
      .mockReturnValueOnce(makeEventStream([
        { type: 'toolcall_end', toolCall },
        { type: 'done', message: assistantWithTool },
      ], assistantWithTool))
      .mockReturnValueOnce(makeEventStream([
        { type: 'done', message: finalAssistant },
      ], finalAssistant))

    const rt = new AgentRuntime({
      model: { id: 'test' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map([['file_read', handler]]),
      apiKey: 'test',
      router,
      safetyPolicy,
      onLifecycleEvent: (e) => lifecycleEvents.push(e),
    })

    rt.messages.push({ role: 'user', content: 'read', timestamp: Date.now() })
    await rt.run()

    const types = lifecycleEvents.map(e => e.type)

    // Should have: assistant_turn_start, assistant_turn_end, tool_call_created,
    // tool_call_updated (checked), tool_call_updated (executing),
    // tool_call_updated (stdout), tool_call_completed,
    // assistant_turn_start, assistant_turn_end, session_done
    expect(types).toContain('assistant_turn_start')
    expect(types).toContain('assistant_turn_end')
    expect(types).toContain('tool_call_created')
    expect(types).toContain('tool_call_updated')
    expect(types).toContain('tool_call_completed')
    expect(types).toContain('session_done')

    // The completed tool call should have stdout
    const completed = lifecycleEvents.find(
      e => e.type === 'tool_call_completed',
    )
    expect(completed).toBeDefined()
    if (completed?.type === 'tool_call_completed') {
      expect(completed.toolCall.stdout).toBe('output-chunk')
      expect(completed.toolCall.result).toBe('done')
      expect(completed.toolCall.phase).toBe('completed')
      expect(completed.toolCall.safety?.riskLevel).toBe('safe')
    }
  })

  it('emits tool_call with route info for routed bash call', async () => {
    const lifecycleEvents: LifecycleEvent[] = []
    const router = new ToolRouter()
    const safetyPolicy = new ToolSafetyPolicy({ cwd: '/tmp' })

    const handler: ToolHandler = vi.fn(async () => ({
      output: 'file contents',
      isError: false,
    }))

    const toolCall = {
      type: 'toolCall',
      id: 'tc-1',
      name: 'bash',
      arguments: { command: 'cat foo.ts' },
    }

    const assistantWithTool = makeAssistantMessage({
      content: [toolCall],
      stopReason: 'toolUse',
    })

    const finalAssistant = makeAssistantMessage({
      content: [{ type: 'text', text: 'Done' }],
    })

    streamSimpleMock
      .mockReturnValueOnce(makeEventStream([
        { type: 'toolcall_end', toolCall },
        { type: 'done', message: assistantWithTool },
      ], assistantWithTool))
      .mockReturnValueOnce(makeEventStream([
        { type: 'done', message: finalAssistant },
      ], finalAssistant))

    const rt = new AgentRuntime({
      model: { id: 'test' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map([['file_read', handler]]),
      apiKey: 'test',
      router,
      safetyPolicy,
      onLifecycleEvent: (e) => lifecycleEvents.push(e),
    })

    rt.messages.push({ role: 'user', content: 'read', timestamp: Date.now() })
    await rt.run()

    const completed = lifecycleEvents.find(e => e.type === 'tool_call_completed')
    expect(completed).toBeDefined()
    if (completed?.type === 'tool_call_completed') {
      expect(completed.toolCall.route?.wasRouted).toBe(true)
      expect(completed.toolCall.route?.originalToolName).toBe('bash')
      expect(completed.toolCall.toolName).toBe('file_read')
    }
  })

  it('emits blocked_enter for waiting_user', async () => {
    const lifecycleEvents: LifecycleEvent[] = []

    const toolCall = {
      type: 'toolCall',
      id: 'tc-ask',
      name: 'AskUserQuestion',
      arguments: { question: 'What?', why_ask: 'Need to know' },
    }

    const assistantWithAsk = makeAssistantMessage({
      content: [toolCall],
      stopReason: 'toolUse',
    })

    streamSimpleMock.mockReturnValueOnce(
      makeEventStream([
        { type: 'toolcall_end', toolCall },
        { type: 'done', message: assistantWithAsk },
      ], assistantWithAsk),
    )

    const rt = new AgentRuntime({
      model: { id: 'test' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map(),
      apiKey: 'test',
      onLifecycleEvent: (e) => lifecycleEvents.push(e),
    })

    rt.messages.push({ role: 'user', content: 'help', timestamp: Date.now() })
    await rt.run()

    const blocked = lifecycleEvents.find(e => e.type === 'blocked_enter')
    expect(blocked).toBeDefined()
    if (blocked?.type === 'blocked_enter') {
      expect(blocked.reason).toBe('waiting_user')
      expect(blocked.question).toBe('What?')
    }
  })

  it('assistant_turn_start carries reasoning state that evolves with thinking_delta', async () => {
    const lifecycleEvents: LifecycleEvent[] = []

    const finalAssistant = makeAssistantMessage({
      content: [{ type: 'text', text: 'Done' }],
    })

    streamSimpleMock.mockReturnValueOnce(makeEventStream([
      { type: 'thinking_start', contentIndex: 0 },
      { type: 'thinking_delta', contentIndex: 0, delta: 'I need to ' },
      { type: 'thinking_delta', contentIndex: 0, delta: 'check the file.' },
      { type: 'thinking_end', contentIndex: 0, content: 'I need to check the file.' },
      { type: 'done', message: finalAssistant },
    ], finalAssistant))

    const rt = new AgentRuntime({
      model: { id: 'test' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map(),
      apiKey: 'test',
      onLifecycleEvent: (e) => lifecycleEvents.push(e),
    })

    rt.messages.push({ role: 'user', content: 'hi', timestamp: Date.now() })
    await rt.run()

    // assistant_turn_start should have reasoning with status 'thinking'
    const turnStart = lifecycleEvents.find(e => e.type === 'assistant_turn_start')
    expect(turnStart).toBeDefined()
    if (turnStart?.type === 'assistant_turn_start') {
      expect(turnStart.reasoning).toBeDefined()
      expect(turnStart.reasoning.status).toBe('thinking')
    }

    // assistant_turn_end should have reasoning with accumulated rawThoughtText
    const turnEnd = lifecycleEvents.find(e => e.type === 'assistant_turn_end')
    expect(turnEnd).toBeDefined()
    if (turnEnd?.type === 'assistant_turn_end') {
      expect(turnEnd.reasoning.rawThoughtText).toBe('I need to check the file.')
      expect(turnEnd.reasoning.status).toBe('completed')
    }
  })

  it('tool_call.displayReason is projected from reasoning intent', async () => {
    const lifecycleEvents: LifecycleEvent[] = []
    const router = new ToolRouter()
    const safetyPolicy = new ToolSafetyPolicy({ cwd: '/tmp' })

    const handler: ToolHandler = vi.fn(async () => ({
      output: 'done',
      isError: false,
    }))

    const toolCall = {
      type: 'toolCall',
      id: 'tc-1',
      name: 'file_read',
      arguments: { file_path: 'foo.ts' },
    }

    const assistantWithTool = makeAssistantMessage({
      content: [toolCall],
      stopReason: 'toolUse',
    })

    const finalAssistant = makeAssistantMessage({
      content: [{ type: 'text', text: 'Done' }],
    })

    streamSimpleMock
      .mockReturnValueOnce(makeEventStream([
        { type: 'thinking_start', contentIndex: 0 },
        { type: 'thinking_delta', contentIndex: 0, delta: 'I should read foo.ts to understand the structure' },
        { type: 'thinking_end', contentIndex: 0, content: 'I should read foo.ts to understand the structure' },
        { type: 'toolcall_end', toolCall },
        { type: 'done', message: assistantWithTool },
      ], assistantWithTool))
      .mockReturnValueOnce(makeEventStream([
        { type: 'done', message: finalAssistant },
      ], finalAssistant))

    const rt = new AgentRuntime({
      model: { id: 'test' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map([['file_read', handler]]),
      apiKey: 'test',
      router,
      safetyPolicy,
      onLifecycleEvent: (e) => lifecycleEvents.push(e),
    })

    rt.messages.push({ role: 'user', content: 'read', timestamp: Date.now() })
    await rt.run()

    // displayReason is now projected from extracted intent
    const completed = lifecycleEvents.find(e => e.type === 'tool_call_completed')
    expect(completed).toBeDefined()
    if (completed?.type === 'tool_call_completed') {
      expect(completed.toolCall.displayReason).toBe('I should read foo.')
    }
  })

  it('blocked_enter for waiting_user carries reasoning context', async () => {
    const lifecycleEvents: LifecycleEvent[] = []

    const toolCall = {
      type: 'toolCall',
      id: 'tc-ask',
      name: 'AskUserQuestion',
      arguments: { question: 'What color?', why_ask: 'Need to know' },
    }

    const assistantWithAsk = makeAssistantMessage({
      content: [toolCall],
      stopReason: 'toolUse',
    })

    streamSimpleMock.mockReturnValueOnce(
      makeEventStream([
        { type: 'thinking_start', contentIndex: 0 },
        { type: 'thinking_delta', contentIndex: 0, delta: 'I am unsure about the color preference.' },
        { type: 'thinking_end', contentIndex: 0, content: 'I am unsure about the color preference.' },
        { type: 'toolcall_end', toolCall },
        { type: 'done', message: assistantWithAsk },
      ], assistantWithAsk),
    )

    const rt = new AgentRuntime({
      model: { id: 'test' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map(),
      apiKey: 'test',
      onLifecycleEvent: (e) => lifecycleEvents.push(e),
    })

    rt.messages.push({ role: 'user', content: 'help', timestamp: Date.now() })
    await rt.run()

    // Find the blocked_enter with waiting_user (from the AskUserQuestion intercept, not finishBurst)
    const blockedEvents = lifecycleEvents.filter(e => e.type === 'blocked_enter' && e.reason === 'waiting_user')
    expect(blockedEvents.length).toBeGreaterThanOrEqual(1)
    const blocked = blockedEvents[0]!
    if (blocked.type === 'blocked_enter') {
      expect(blocked.reasoning).toBeDefined()
      expect(blocked.reasoning!.rawThoughtText).toContain('color preference')
    }
  })
})
