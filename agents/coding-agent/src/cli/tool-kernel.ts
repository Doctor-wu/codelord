import type { Tool } from '@mariozechner/pi-ai'
import {
  bashTool,
  createBashToolHandler,
  fileReadTool,
  createFileReadHandler,
  fileWriteTool,
  createFileWriteHandler,
  fileEditTool,
  createFileEditHandler,
  searchTool,
  createSearchHandler,
  lsTool,
  createLsHandler,
} from '@agent/core'
import type { ToolHandler } from '@agent/core'
import type { CodelordConfig } from '@agent/config'

// ---------------------------------------------------------------------------
// Tool Kernel — shared assembly for single-shot and REPL
// ---------------------------------------------------------------------------

export interface ToolKernel {
  tools: Tool[]
  toolHandlers: Map<string, ToolHandler>
}

export interface ToolKernelOptions {
  cwd: string
  config: CodelordConfig
}

/**
 * Assemble the built-in tool kernel.
 * Both runAgentCommand() and startRepl() must call this to get the same
 * tool set and handler wiring.
 */
export function createToolKernel(options: ToolKernelOptions): ToolKernel {
  const { cwd, config } = options

  const tools: Tool[] = [
    bashTool,
    fileReadTool,
    fileWriteTool,
    fileEditTool,
    searchTool,
    lsTool,
  ]

  const toolHandlers: Map<string, ToolHandler> = new Map([
    ['bash', createBashToolHandler({
      cwd,
      timeout: config.bash.timeout,
      maxOutput: config.bash.maxOutput,
    })],
    ['file_read', createFileReadHandler({ cwd })],
    ['file_write', createFileWriteHandler({ cwd })],
    ['file_edit', createFileEditHandler({ cwd })],
    ['search', createSearchHandler({ cwd })],
    ['ls', createLsHandler({ cwd })],
  ])

  return { tools, toolHandlers }
}
