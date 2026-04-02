import { describe, expect, it } from 'vitest'
import {
  builtinContracts,
  bashContract,
  fileReadContract,
  fileWriteContract,
  fileEditContract,
  searchContract,
  lsContract,
  askUserQuestionContract,
} from '../src/tools/contracts.js'
import type { ToolContract } from '../src/tools/contracts.js'

// ---------------------------------------------------------------------------
// Every built-in tool has a contract
// ---------------------------------------------------------------------------

describe('ToolContract existence', () => {
  const expectedTools = [
    'bash', 'file_read', 'file_write', 'file_edit', 'search', 'ls', 'AskUserQuestion',
  ]

  for (const name of expectedTools) {
    it(`${name} has a contract in builtinContracts`, () => {
      expect(builtinContracts.has(name)).toBe(true)
      const c = builtinContracts.get(name)!
      expect(c.toolName).toBe(name)
      expect(c.whenToUse.length).toBeGreaterThan(0)
    })
  }

  it('builtinContracts contains exactly the expected tools', () => {
    expect([...builtinContracts.keys()].sort()).toEqual(expectedTools.sort())
  })
})

// ---------------------------------------------------------------------------
// Contract structure completeness
// ---------------------------------------------------------------------------

describe('ToolContract structure', () => {
  function assertContractShape(c: ToolContract) {
    expect(c.toolName).toBeTypeOf('string')
    expect(Array.isArray(c.whenToUse)).toBe(true)
    expect(Array.isArray(c.whenNotToUse)).toBe(true)
    expect(Array.isArray(c.preconditions)).toBe(true)
    expect(Array.isArray(c.failureSemantics)).toBe(true)
    expect(Array.isArray(c.fallbackHints)).toBe(true)
  }

  for (const [name, contract] of builtinContracts) {
    it(`${name} contract has all required fields`, () => {
      assertContractShape(contract)
    })
  }
})

// ---------------------------------------------------------------------------
// Key semantic boundaries are expressed
// ---------------------------------------------------------------------------

describe('Key contract boundaries', () => {
  it('bash contract says it is a fallback primitive', () => {
    const text = [...bashContract.whenNotToUse, ...bashContract.whenToUse].join(' ')
    expect(text).toMatch(/file_read/)
    expect(text).toMatch(/file_edit/)
  })

  it('file_read contract says to use it when path is known', () => {
    const text = fileReadContract.whenToUse.join(' ')
    expect(text).toMatch(/know.*path|known.*path|already know/i)
  })

  it('file_edit contract documents NO_MATCH and MULTI_MATCH as failures', () => {
    const text = fileEditContract.failureSemantics.join(' ')
    expect(text).toMatch(/NO_MATCH/)
    expect(text).toMatch(/MULTI_MATCH/)
  })

  it('search contract says no matches is NOT an error', () => {
    const text = searchContract.failureSemantics.join(' ')
    expect(text).toMatch(/not.*error|NOT.*error/i)
  })

  it('AskUserQuestion contract says only use for genuine ambiguity', () => {
    const text = askUserQuestionContract.whenToUse.join(' ')
    expect(text).toMatch(/ambigu/i)
  })

  it('AskUserQuestion contract warns against deferring decisions', () => {
    const text = askUserQuestionContract.whenNotToUse.join(' ')
    expect(text).toMatch(/defer|figure out|confirm/i)
  })
})
