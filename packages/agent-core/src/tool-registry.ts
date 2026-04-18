import { createHash } from 'node:crypto'
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

// ---------------------------------------------------------------------------
// ToolRegistry — carrier for tools + contracts + static fingerprint
// ---------------------------------------------------------------------------

export interface ToolRegistryInput {
  tools: readonly Pick<Tool, 'name'>[]
  contracts: readonly ToolContract[]
}

export class ToolRegistry {
  readonly tools: readonly Pick<Tool, 'name'>[]
  readonly contracts: readonly ToolContract[]

  constructor(input: ToolRegistryInput) {
    assertUniqueToolNames(input.tools, 'ToolRegistry')
    assertUniqueContractToolNames(input.contracts, 'ToolRegistry')
    this.tools = input.tools
    this.contracts = input.contracts
  }

  /**
   * Static fingerprint — stable across runs with the same tools/contracts.
   * Intentionally does NOT hash registration order: router behaviour is
   * order-independent, so order would just introduce spurious churn.
   */
  fingerprint(): string {
    const sortedContracts = [...this.contracts]
      .map((c) => ({
        toolName: c.toolName,
        whenToUse: c.whenToUse,
        whenNotToUse: c.whenNotToUse,
        preconditions: c.preconditions,
        failureSemantics: c.failureSemantics,
        fallbackHints: c.fallbackHints,
      }))
      .toSorted((a, b) => a.toolName.localeCompare(b.toolName))

    const sortedToolNames = [...new Set(this.tools.map((t) => t.name))].toSorted()

    const input = JSON.stringify({ contracts: sortedContracts, toolNames: sortedToolNames })
    return createHash('sha256').update(input).digest('hex').slice(0, 16)
  }
}
