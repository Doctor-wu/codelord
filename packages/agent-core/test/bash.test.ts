import { describe, expect, it } from 'vitest'
import { createBashToolHandler } from '../src/tools/bash.js'

describe('createBashToolHandler', () => {
  it('streams stdout chunks and returns isError=false for exit code 0', async () => {
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

    expect(result.isError).toBe(false)
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.some(({ stream }) => stream === 'stdout')).toBe(true)
    expect(chunks.map(({ chunk }) => chunk).join('')).toContain('alpha')
    expect(result.output).toContain('exit code: 0')
    expect(result.output).toContain('alpha')
  })

  it('returns isError=true for non-zero exit code', async () => {
    const handler = createBashToolHandler({ timeout: 5_000 })
    const result = await handler(
      { command: 'exit 1' },
      { emitOutput: () => {} },
    )
    expect(result.isError).toBe(true)
    expect(result.output).toContain('exit code: 1')
  })

  it('returns isError=true with INVALID_ARGS for missing command', async () => {
    const handler = createBashToolHandler({ timeout: 5_000 })
    const result = await handler(
      {},
      { emitOutput: () => {} },
    )
    expect(result.isError).toBe(true)
    expect(result.errorCode).toBe('INVALID_ARGS')
  })
})
