import { describe, expect, it } from 'vitest'
import { buildSystemPrompt } from '../src/cli/system-prompt.js'
import { askUserQuestionContract } from '@codelord/core'
import type { ToolContract } from '@codelord/core'
import { corePlugins } from '@codelord/tools'

const allContracts: readonly ToolContract[] = [
  ...corePlugins.map(p => p.contract),
  askUserQuestionContract,
]

describe('buildSystemPrompt', () => {
  const prompt = buildSystemPrompt({ cwd: '/test/project', contracts: allContracts })

  it('includes the working directory', () => {
    expect(prompt).toContain('/test/project')
  })

  it('includes the role definition', () => {
    expect(prompt).toMatch(/coding agent/i)
  })

  it('states bash is a fallback primitive', () => {
    expect(prompt).toMatch(/fallback/i)
    expect(prompt).toMatch(/prefer.*dedicated.*built-in.*tools.*over.*bash/i)
  })

  it('renders all built-in tool contracts', () => {
    const toolNames = ['bash', 'file_read', 'file_write', 'file_edit', 'search', 'ls', 'AskUserQuestion']
    for (const name of toolNames) {
      expect(prompt).toContain(`### ${name}`)
    }
  })

  it('includes file_edit NO_MATCH / MULTI_MATCH failure semantics', () => {
    expect(prompt).toContain('NO_MATCH')
    expect(prompt).toContain('MULTI_MATCH')
  })

  it('includes search "no matches is not an error" semantics', () => {
    expect(prompt).toMatch(/not.*error|NOT.*error/i)
  })

  it('includes AskUserQuestion guidance', () => {
    expect(prompt).toContain('AskUserQuestion')
    expect(prompt).toMatch(/ambigu/i)
  })

  it('is deterministic (same input produces same output)', () => {
    const prompt2 = buildSystemPrompt({ cwd: '/test/project', contracts: allContracts })
    expect(prompt).toBe(prompt2)
  })

  it('does not import contracts itself — uses only what is passed in', () => {
    // Pass a subset — only that subset should appear
    const subset = allContracts.slice(0, 2)
    const limited = buildSystemPrompt({ cwd: '/x', contracts: subset })
    expect(limited).toContain('### bash')
    expect(limited).toContain('### file_read')
    expect(limited).not.toContain('### file_edit')
    expect(limited).not.toContain('### AskUserQuestion')
  })
})
