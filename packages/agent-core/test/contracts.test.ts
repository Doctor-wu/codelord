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
import type { ToolContract } from '../src/tools/tool-contract.js'

// Also verify contracts are colocated — import directly from each module
import { bashContract as bashDirect } from '../src/tools/bash.js'
import { fileReadContract as fileReadDirect } from '../src/tools/file-read.js'
import { fileWriteContract as fileWriteDirect } from '../src/tools/file-write.js'
import { fileEditContract as fileEditDirect } from '../src/tools/file-edit.js'
import { searchContract as searchDirect } from '../src/tools/search.js'
import { lsContract as lsDirect } from '../src/tools/ls.js'
import { askUserQuestionContract as askDirect } from '../src/tools/ask-user.js'

// ---------------------------------------------------------------------------
// Contracts are colocated in each tool module
// ---------------------------------------------------------------------------

describe('Contracts colocated in tool modules', () => {
  it('bash contract is the same object from bash.ts and contracts.ts', () => {
    expect(bashContract).toBe(bashDirect)
  })
  it('file_read contract is colocated', () => {
    expect(fileReadContract).toBe(fileReadDirect)
  })
  it('file_write contract is colocated', () => {
    expect(fileWriteContract).toBe(fileWriteDirect)
  })
  it('file_edit contract is colocated', () => {
    expect(fileEditContract).toBe(fileEditDirect)
  })
  it('search contract is colocated', () => {
    expect(searchContract).toBe(searchDirect)
  })
  it('ls contract is colocated', () => {
    expect(lsContract).toBe(lsDirect)
  })
  it('AskUserQuestion contract is colocated', () => {
    expect(askUserQuestionContract).toBe(askDirect)
  })
})

// ---------------------------------------------------------------------------
// builtinContracts is a stable ordered array
// ---------------------------------------------------------------------------

describe('builtinContracts aggregation', () => {
  it('contains all 7 tools', () => {
    expect(builtinContracts).toHaveLength(7)
  })

  it('has stable order', () => {
    const names = builtinContracts.map(c => c.toolName)
    expect(names).toEqual([
      'bash', 'file_read', 'file_write', 'file_edit', 'search', 'ls', 'AskUserQuestion',
    ])
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

  for (const contract of builtinContracts) {
    it(`${contract.toolName} contract has all required fields`, () => {
      assertContractShape(contract)
    })
  }
})

// ---------------------------------------------------------------------------
// Key semantic boundaries
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
