import { describe, expect, it } from 'vitest'
import type { ToolContract } from '@codelord/core'
import {
  bashPlugin,
  fileReadPlugin,
  fileWritePlugin,
  fileEditPlugin,
  searchPlugin,
  lsPlugin,
  corePlugins,
} from '../src/index.js'

describe('ToolContract structure', () => {
  function assertContractShape(c: ToolContract) {
    expect(c.toolName).toBeTypeOf('string')
    expect(Array.isArray(c.whenToUse)).toBe(true)
    expect(Array.isArray(c.whenNotToUse)).toBe(true)
    expect(Array.isArray(c.preconditions)).toBe(true)
    expect(Array.isArray(c.failureSemantics)).toBe(true)
    expect(Array.isArray(c.fallbackHints)).toBe(true)
  }

  for (const plugin of corePlugins) {
    it(`${plugin.id} contract has all required fields`, () => {
      assertContractShape(plugin.contract)
    })
  }
})

describe('Key contract boundaries', () => {
  it('bash contract says it is a fallback primitive', () => {
    const text = [...bashPlugin.contract.whenNotToUse, ...bashPlugin.contract.whenToUse].join(' ')
    expect(text).toMatch(/file_read/)
    expect(text).toMatch(/file_edit/)
  })

  it('file_read contract says to use it when path is known', () => {
    const text = fileReadPlugin.contract.whenToUse.join(' ')
    expect(text).toMatch(/know.*path|known.*path|already know/i)
  })

  it('file_edit contract documents NO_MATCH and MULTI_MATCH as failures', () => {
    const text = fileEditPlugin.contract.failureSemantics.join(' ')
    expect(text).toMatch(/NO_MATCH/)
    expect(text).toMatch(/MULTI_MATCH/)
  })

  it('search contract says no matches is NOT an error', () => {
    const text = searchPlugin.contract.failureSemantics.join(' ')
    expect(text).toMatch(/not.*error|NOT.*error/i)
  })
})
