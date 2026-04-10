import type { Tool } from '@mariozechner/pi-ai'
import type { ToolHandler } from './react-loop.js'
import type { ToolContract } from './tools/tool-contract.js'
import type { RiskLevel } from './tool-safety.js'

export interface ToolPluginContext {
  cwd: string
  config: Record<string, unknown>
  env: Record<string, string | undefined>
}

export interface ToolPlugin {
  /** Unique tool identifier, must match Tool.name */
  id: string
  /** pi-ai tool schema */
  tool: Tool
  /** Factory to create the handler */
  createHandler: (ctx: ToolPluginContext) => ToolHandler
  /** Tool contract */
  contract: ToolContract
  /** Risk level for safety policy */
  riskLevel: RiskLevel
  /** Core tools are always enabled; optional tools require config */
  category: 'core' | 'optional'
  /** Environment variables this tool requires (for optional tools) */
  requiredEnv?: string[]
}
