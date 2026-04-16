import type { Tool } from '@mariozechner/pi-ai'
import type { ToolContract } from './tools/tool-contract.js'

function assertUniqueNames(names: readonly string[], label: string, scope: string): void {
  const seen = new Set<string>()

  for (const name of names) {
    if (seen.has(name)) {
      throw new Error(`Duplicate ${label} "${name}" in ${scope}.`)
    }
    seen.add(name)
  }
}

export function assertUniqueToolNames(tools: readonly Pick<Tool, 'name'>[], scope: string): void {
  assertUniqueNames(
    tools.map((tool) => tool.name),
    'tool name',
    scope,
  )
}

export function assertUniqueContractToolNames(
  contracts: readonly Pick<ToolContract, 'toolName'>[],
  scope: string,
): void {
  assertUniqueNames(
    contracts.map((contract) => contract.toolName),
    'tool contract',
    scope,
  )
}
