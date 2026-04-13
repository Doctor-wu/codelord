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

describe('Runtime + ToolSafetyPolicy integration', () => {
  afterEach(() => {
    streamSimpleMock.mockReset()
  })

  it('dangerous bash is blocked — handler NOT called, RISK_BLOCKED returned', async () => {
    const router = new ToolRouter()
    const safetyPolicy = new ToolSafetyPolicy({ cwd: '/tmp' })

    const bashHandler: ToolHandler = vi.fn(async () => ({
      output: 'should not run',
      isError: false,
    }))

    const toolCall = {
      type: 'toolCall',
      id: 'tc-1',
      name: 'bash',
      arguments: { command: 'rm -rf /' },
    }

    const assistantWithTool = makeAssistantMessage({
      content: [toolCall],
      stopReason: 'toolUse',
    })

    const finalAssistant = makeAssistantMessage({
      content: [{ type: 'text', text: 'OK' }],
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
      toolHandlers: new Map([['bash', bashHandler]]),
      apiKey: 'test',
      router,
      safetyPolicy,
    })

    rt.messages.push({ role: 'user', content: 'delete everything', timestamp: Date.now() })
    await rt.run()

    // Handler was NOT called
    expect(bashHandler).not.toHaveBeenCalled()

    // History: toolResult has isError=true
    const toolResultMsg = rt.messages.find(m => m.role === 'toolResult')
    expect((toolResultMsg as any).isError).toBe(true)
    expect((toolResultMsg as any).content[0].text).toContain('RISK_BLOCKED')

    // Safety records
    expect(rt.safetyRecords).toHaveLength(1)
    expect(rt.safetyRecords[0].wasBlocked).toBe(true)
    expect(rt.safetyRecords[0].riskLevel).toBe('dangerous')
  })

  it('write-level tool is allowed and recorded', async () => {
    const router = new ToolRouter()
    const safetyPolicy = new ToolSafetyPolicy({ cwd: '/tmp' })

    const fileWriteHandler: ToolHandler = vi.fn(async () => ({
      output: 'Written successfully',
      isError: false,
    }))

    const toolCall = {
      type: 'toolCall',
      id: 'tc-1',
      name: 'file_write',
      arguments: { file_path: 'foo.ts', content: 'hello' },
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
      toolHandlers: new Map([['file_write', fileWriteHandler]]),
      apiKey: 'test',
      router,
      safetyPolicy,
    })

    rt.messages.push({ role: 'user', content: 'write file', timestamp: Date.now() })
    await rt.run()

    // Handler WAS called
    expect(fileWriteHandler).toHaveBeenCalled()

    // Safety records
    expect(rt.safetyRecords).toHaveLength(1)
    expect(rt.safetyRecords[0].riskLevel).toBe('write')
    expect(rt.safetyRecords[0].allowed).toBe(true)
  })

  it('bash cat routed to file_read is assessed as safe', async () => {
    const router = new ToolRouter()
    const safetyPolicy = new ToolSafetyPolicy({ cwd: '/tmp' })

    const fileReadHandler: ToolHandler = vi.fn(async () => ({
      output: 'file contents',
      isError: false,
    }))

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
      .mockReturnValueOnce(makeEventStream([
        { type: 'done', message: finalAssistant },
      ], finalAssistant))

    const rt = new AgentRuntime({
      model: { id: 'test' } as never,
      systemPrompt: 'test',
      tools: [],
      toolHandlers: new Map([['file_read', fileReadHandler]]),
      apiKey: 'test',
      router,
      safetyPolicy,
    })

    rt.messages.push({ role: 'user', content: 'read file', timestamp: Date.now() })
    await rt.run()

    // Routed to file_read handler was called
    expect(fileReadHandler).toHaveBeenCalled()
  })

  it('AskUserQuestion does NOT go through safety gate', async () => {
    const router = new ToolRouter()
    const safetyPolicy = new ToolSafetyPolicy({ cwd: '/tmp' })
    const assessSpy = vi.spyOn(safetyPolicy, 'assess')

    const toolCall = {
      type: 'toolCall',
      id: 'tc-ask',
      name: ASK_USER_QUESTION_TOOL_NAME,
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
      router,
      safetyPolicy,
    })

    rt.messages.push({ role: 'user', content: 'help', timestamp: Date.now() })
    const outcome = await rt.run()

    expect(outcome.type).toBe('blocked')
    // Safety policy should NOT have been called
    expect(assessSpy).not.toHaveBeenCalled()
  })

  it('git reset --hard is blocked', async () => {
    const safetyPolicy = new ToolSafetyPolicy({ cwd: '/tmp' })

    const bashHandler: ToolHandler = vi.fn(async () => ({
      output: 'should not run',
      isError: false,
    }))

    const toolCall = {
      type: 'toolCall',
      id: 'tc-1',
      name: 'bash',
      arguments: { command: 'git reset --hard HEAD~3' },
    }

    const assistantWithTool = makeAssistantMessage({
      content: [toolCall],
      stopReason: 'toolUse',
    })

    const finalAssistant = makeAssistantMessage({
      content: [{ type: 'text', text: 'OK' }],
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
      toolHandlers: new Map([['bash', bashHandler]]),
      apiKey: 'test',
      safetyPolicy,
    })

    rt.messages.push({ role: 'user', content: 'reset', timestamp: Date.now() })
    await rt.run()

    expect(bashHandler).not.toHaveBeenCalled()
  })
})
