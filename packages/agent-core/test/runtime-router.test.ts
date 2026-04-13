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
import { ASK_USER_QUESTION_TOOL_NAME } from '../src/tools/ask-user.js'
import type { ToolHandler } from '../src/react-loop.js'

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

describe('Runtime + ToolRouter integration', () => {
  afterEach(() => {
    streamSimpleMock.mockReset()
  })

  it('routes bash cat to file_read and history reflects file_read', async () => {
    const router = new ToolRouter()

    const fileReadHandler: ToolHandler = vi.fn(async () => ({
      output: 'file contents here',
      isError: false,
    }))

    const toolHandlers = new Map<string, ToolHandler>([
      ['file_read', fileReadHandler],
      ['bash', vi.fn(async () => ({ output: 'should not be called', isError: false }))],
    ])

    const toolCall = {
      type: 'toolCall',
      id: 'tc-1',
      name: 'bash',
      arguments: { command: 'cat src/index.ts' },
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
      .mockReturnValueOnce(makeEventStream([{ type: 'done', message: finalAssistant }], finalAssistant))

    const rt = new AgentRuntime({
      model: { id: 'test' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers,
      apiKey: 'test',
      router,
    })

    rt.messages.push({ role: 'user', content: 'read the file', timestamp: Date.now() })
    await rt.run()

    // file_read handler was called, not bash
    expect(fileReadHandler).toHaveBeenCalledWith(
      { file_path: 'src/index.ts' },
      expect.anything(),
    )
    expect(toolHandlers.get('bash')).not.toHaveBeenCalled()

    // History: toolResult message reflects file_read, not bash
    const toolResultMsg = rt.messages.find(m => m.role === 'toolResult')
    expect(toolResultMsg).toBeDefined()
    expect((toolResultMsg as any).toolName).toBe('file_read')

    // History: assistant message's tool call was rewritten
    const assistantMsg = rt.messages.find(m => m.role === 'assistant' && (m as any).content?.some?.((c: any) => c.type === 'toolCall'))
    const rewrittenTc = (assistantMsg as any).content.find((c: any) => c.type === 'toolCall')
    expect(rewrittenTc.name).toBe('file_read')
    expect(rewrittenTc.arguments).toEqual({ file_path: 'src/index.ts' })

    // Route records side-channel
    expect(rt.routeRecords).toHaveLength(1)
    expect(rt.routeRecords[0].ruleId).toBe('bash_cat_to_file_read')
  })

  it('does NOT route complex bash commands', async () => {
    const router = new ToolRouter()

    const bashHandler: ToolHandler = vi.fn(async () => ({
      output: 'bash output',
      isError: false,
    }))

    const toolHandlers = new Map<string, ToolHandler>([
      ['bash', bashHandler],
    ])

    const toolCall = {
      type: 'toolCall',
      id: 'tc-1',
      name: 'bash',
      arguments: { command: 'npm test && echo done' },
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
      .mockReturnValueOnce(makeEventStream([{ type: 'done', message: finalAssistant }], finalAssistant))

    const rt = new AgentRuntime({
      model: { id: 'test' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers,
      apiKey: 'test',
      router,
    })

    rt.messages.push({ role: 'user', content: 'run tests', timestamp: Date.now() })
    await rt.run()

    // bash handler was called directly
    expect(bashHandler).toHaveBeenCalled()

    // Route records empty
    expect(rt.routeRecords).toHaveLength(0)

    // History reflects bash
    const toolResultMsg = rt.messages.find(m => m.role === 'toolResult')
    expect((toolResultMsg as any).toolName).toBe('bash')
  })

  it('AskUserQuestion is NOT routed', async () => {
    const router = new ToolRouter()
    const routeSpy = vi.spyOn(router, 'route')

    const toolCall = {
      type: 'toolCall',
      id: 'tc-ask',
      name: ASK_USER_QUESTION_TOOL_NAME,
      arguments: {
        question: 'What color?',
        why_ask: 'Need to know',
      },
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
      router,
    })

    rt.messages.push({ role: 'user', content: 'help', timestamp: Date.now() })
    const outcome = await rt.run()

    expect(outcome.type).toBe('blocked')
    // Router should NOT have been called for AskUserQuestion
    expect(routeSpy).not.toHaveBeenCalled()
  })

  it('direct built-in tool calls pass through router without rewrite', async () => {
    const router = new ToolRouter()

    const fileReadHandler: ToolHandler = vi.fn(async () => ({
      output: 'file contents',
      isError: false,
    }))

    const toolHandlers = new Map<string, ToolHandler>([
      ['file_read', fileReadHandler],
    ])

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
      .mockReturnValueOnce(makeEventStream([{ type: 'done', message: finalAssistant }], finalAssistant))

    const rt = new AgentRuntime({
      model: { id: 'test' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers,
      apiKey: 'test',
      router,
    })

    rt.messages.push({ role: 'user', content: 'read', timestamp: Date.now() })
    await rt.run()

    // No routing occurred
    expect(rt.routeRecords).toHaveLength(0)

    // Handler called with original args
    expect(fileReadHandler).toHaveBeenCalledWith({ file_path: 'foo.ts' }, expect.anything())
  })
})
