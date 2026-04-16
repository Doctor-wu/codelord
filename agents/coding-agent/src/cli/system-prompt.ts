import type { ToolContract } from '@codelord/core'

// ---------------------------------------------------------------------------
// System prompt builder — shared by single-shot and REPL
// ---------------------------------------------------------------------------

export interface SystemPromptOptions {
  cwd: string
  contracts: readonly ToolContract[]
}

/**
 * Build the system prompt for the coding agent.
 * This is the single source of truth — run.ts and repl.ts both use this.
 * Contracts are passed in from the tool kernel, not imported directly.
 */
export function buildSystemPrompt(options: SystemPromptOptions): string {
  const { cwd, contracts } = options

  const sections: string[] = [buildRoleSection(), buildContextSection(cwd), buildToolGuidanceSection(contracts)]

  return sections.join('\n\n')
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function buildRoleSection(): string {
  return `You are a coding agent. You help users understand, modify, debug, and build software projects.

You have access to built-in tools for file operations, code search, directory browsing, and shell commands. Use the most specific tool for each task.`
}

function buildContextSection(cwd: string): string {
  return `Working directory: ${cwd}`
}

function buildToolGuidanceSection(contracts: readonly ToolContract[]): string {
  const lines: string[] = [
    '## Tool usage guidelines',
    '',
    'IMPORTANT: Always prefer dedicated built-in tools over bash. bash is a fallback primitive for operations not covered by other tools.',
    '',
    'IMPORTANT: When web_search and web_fetch tools are available, ALWAYS use them for web access instead of bash curl/wget. web_search provides structured search results with less token overhead. web_fetch returns clean markdown from web pages. Only fall back to bash curl/wget if these dedicated web tools are not available.',
    '',
  ]

  for (const contract of contracts) {
    lines.push(renderContract(contract))
    lines.push('')
  }

  return lines.join('\n')
}

function renderContract(c: ToolContract): string {
  const lines: string[] = [`### ${c.toolName}`]

  if (c.whenToUse.length > 0) {
    lines.push(`Use when: ${c.whenToUse.join(' ')}`)
  }
  if (c.whenNotToUse.length > 0) {
    lines.push(`Avoid: ${c.whenNotToUse.join(' ')}`)
  }
  if (c.preconditions.length > 0) {
    lines.push(`Requires: ${c.preconditions.join(' ')}`)
  }
  if (c.failureSemantics.length > 0) {
    lines.push(`Failures: ${c.failureSemantics.join(' ')}`)
  }
  if (c.fallbackHints.length > 0) {
    lines.push(`On failure: ${c.fallbackHints.join(' ')}`)
  }

  return lines.join('\n')
}
