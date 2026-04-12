import type { Tool } from '@mariozechner/pi-ai'
import type { ToolPlugin, ToolPluginContext, ToolHandler, ToolContract, RiskLevel } from '@codelord/core'
import { askUserQuestionContract, ToolRouter, ToolSafetyPolicy } from '@codelord/core'
import { corePlugins, optionalPlugins } from '@codelord/tools'
import type { CodelordConfig } from '@codelord/config'

// ---------------------------------------------------------------------------
// Tool Kernel — shared assembly for single-shot and REPL
// ---------------------------------------------------------------------------

export interface ToolKernel {
  tools: Tool[]
  toolHandlers: Map<string, ToolHandler>
  contracts: readonly ToolContract[]
  router: ToolRouter
  safetyPolicy: ToolSafetyPolicy
}

export interface ToolKernelOptions {
  cwd: string
  config: CodelordConfig
}

function assertUniqueNames(
  names: readonly string[],
  label: string,
  scope: string,
): void {
  const seen = new Set<string>()

  for (const name of names) {
    if (seen.has(name)) {
      throw new Error(`Duplicate ${label} "${name}" in ${scope}.`)
    }
    seen.add(name)
  }
}

/**
 * Assemble the tool kernel from plugins.
 * startRepl() calls this to get the tool set, handler wiring, contracts, and router.
 */
export function createToolKernel(options: ToolKernelOptions): ToolKernel {
  const { cwd, config } = options

  // Collect enabled plugins
  const plugins: ToolPlugin[] = [...corePlugins]

  // Add optional plugins based on config and env
  for (const plugin of optionalPlugins) {
    const toolConfig = config.tools?.[plugin.id]

    // If explicitly disabled in config, skip
    if (toolConfig?.enabled === false) continue

    // Check required environment variables (skip silently if not available)
    if (plugin.requiredEnv && plugin.requiredEnv.length > 0) {
      const hasEnv = plugin.requiredEnv.every(
        (key: string) => process.env[key] || toolConfig?.[key],
      )
      if (!hasEnv) continue
    }

    plugins.push(plugin)
  }

  // Build context and instantiate handlers
  const tools: Tool[] = []
  const toolHandlers = new Map<string, ToolHandler>()
  const contracts: ToolContract[] = []
  const riskMap: Record<string, RiskLevel> = {}

  for (const plugin of plugins) {
    const ctx: ToolPluginContext = {
      cwd,
      config: resolvePluginConfig(plugin.id, config),
      env: process.env as Record<string, string | undefined>,
    }
    tools.push(plugin.tool)
    toolHandlers.set(plugin.id, plugin.createHandler(ctx))
    contracts.push(plugin.contract)
    riskMap[plugin.id] = plugin.riskLevel
  }

  // AskUserQuestion is appended by AgentRuntime as a control tool.
  // Keep only the contract here so the system prompt documents it once.
  contracts.push(askUserQuestionContract)

  assertUniqueNames(tools.map((tool) => tool.name), 'tool name', 'tool kernel assembly')
  assertUniqueNames(contracts.map((contract) => contract.toolName), 'tool contract', 'tool kernel assembly')

  const router = new ToolRouter(contracts)
  const safetyPolicy = new ToolSafetyPolicy({ cwd, riskMap })

  return { tools, toolHandlers, contracts, router, safetyPolicy }
}

/** Resolve per-tool config from CodelordConfig */
function resolvePluginConfig(toolId: string, config: CodelordConfig): Record<string, unknown> {
  if (toolId === 'bash') {
    return { timeout: config.bash.timeout, maxOutput: config.bash.maxOutput }
  }
  // Pass through tool-specific config for optional tools
  const toolCfg = config.tools?.[toolId]
  if (toolCfg) {
    return { ...toolCfg }
  }
  return {}
}
