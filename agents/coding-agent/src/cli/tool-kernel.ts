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
  builtinContracts,
  ToolRouter,
} from '@agent/core'
import type { ToolHandler, ToolContract } from '@agent/core'
import type { CodelordConfig } from '@agent/config'

// ---------------------------------------------------------------------------
// Tool Kernel — shared assembly for single-shot and REPL
// ---------------------------------------------------------------------------

export interface ToolKernel {
  tools: Tool[]
  toolHandlers: Map<string, ToolHandler>
  contracts: readonly ToolContract[]
  router: ToolRouter
}

export interface ToolKernelOptions {
  cwd: string
  config: CodelordConfig
}

/**
 * Assemble the built-in tool kernel.
 * Both runAgentCommand() and startRepl() must call this to get the same
 * tool set, handler wiring, contracts, and router.
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

  const router = new ToolRouter()

  return { tools, toolHandlers, contracts: builtinContracts, router }
}
