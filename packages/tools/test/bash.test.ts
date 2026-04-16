import { describe, expect, it } from 'vitest'
import { bashPlugin } from '../src/index.js'

function createBashToolHandler(opts: { timeout?: number; maxOutput?: number; cwd?: string }) {
  return bashPlugin.createHandler({
    cwd: opts.cwd ?? process.cwd(),
    config: { timeout: opts.timeout, maxOutput: opts.maxOutput },
    env: {},
  })
}

describe('createBashToolHandler', () => {
  it('streams stdout chunks and returns isError=false for exit code 0', async () => {
    const handler = createBashToolHandler({ timeout: 5_000, maxOutput: 2_000 })

    const chunks: Array<{ stream: 'stdout' | 'stderr'; chunk: string }> = []
    const result = await handler(
      { command: "printf 'alpha\\n'; sleep 0.05; printf 'beta\\n'" },
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
  })

  it('returns isError=true for non-zero exit code', async () => {
    const handler = createBashToolHandler({ timeout: 5_000 })
    const result = await handler({ command: 'exit 1' }, { emitOutput: () => {} })
    expect(result.isError).toBe(true)
    expect(result.output).toContain('exit code: 1')
  })

  it('returns isError=true with INVALID_ARGS for missing command', async () => {
    const handler = createBashToolHandler({ timeout: 5_000 })
    const result = await handler({}, { emitOutput: () => {} })
    expect(result.isError).toBe(true)
    expect(result.errorCode).toBe('INVALID_ARGS')
  })
})
