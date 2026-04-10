import { afterEach, describe, expect, it } from 'vitest'
import { createToolKernel } from '../src/cli/tool-kernel.js'
import { corePlugins } from '@codelord/tools'
import type { ToolPlugin } from '@codelord/core'
import type { CodelordConfig } from '@codelord/config'

const testConfig: CodelordConfig = {
  provider: 'anthropic',
  model: 'test-model',
  apiKey: 'test-key',
  maxSteps: 5,
  reasoningLevel: 'off',
  bash: { timeout: 5000, maxOutput: 1000 },
}

describe('createToolKernel', () => {
  let appendedPlugin: ToolPlugin | null = null

  afterEach(() => {
    if (appendedPlugin) {
      const idx = corePlugins.indexOf(appendedPlugin)
      if (idx >= 0) corePlugins.splice(idx, 1)
      appendedPlugin = null
    }
  })

  it('throws when plugin assembly would produce duplicate tool names', () => {
    appendedPlugin = {
      ...corePlugins[0]!,
      id: 'bash-duplicate',
    }
    corePlugins.push(appendedPlugin)

    expect(() => createToolKernel({ cwd: '/tmp', config: testConfig })).toThrow(
      'Duplicate tool name "bash" in tool kernel assembly.',
    )
  })
})
