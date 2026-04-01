import { describe, expect, it } from 'vitest'
import { createBashToolHandler } from '../src/tools/bash.js'

describe('createBashToolHandler', () => {
  it('streams stdout chunks before returning the final formatted result', async () => {
    const handler = createBashToolHandler({
      timeout: 5_000,
      maxOutput: 2_000,
    })

    const chunks: Array<{ stream: 'stdout' | 'stderr'; chunk: string }> = []
    const result = await handler(
      {
        command: "printf 'alpha\\n'; sleep 0.05; printf 'beta\\n'",
      },
      {
        emitOutput: (stream, chunk) => {
          chunks.push({ stream, chunk })
        },
      },
    )

    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.some(({ stream }) => stream === 'stdout')).toBe(true)
    expect(chunks.map(({ chunk }) => chunk).join('')).toContain('alpha')
    expect(chunks.map(({ chunk }) => chunk).join('')).toContain('beta')
    expect(result).toContain('exit code: 0')
    expect(result).toContain('stdout:')
    expect(result).toContain('alpha')
    expect(result).toContain('beta')
  })
})
