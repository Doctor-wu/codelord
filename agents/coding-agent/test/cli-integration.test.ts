import { describe, expect, it, vi, afterEach } from 'vite-plus/test'

// We can't reliably mock startRepl across ESM boundaries in vitest,
// so we test the trace command routing directly.

import { handleTraceCommand } from '../src/cli/index.js'

describe('CLI: trace subcommand routing', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    consoleLogSpy?.mockRestore()
    consoleErrorSpy?.mockRestore()
    process.exitCode = undefined
  })

  it('trace list runs without error', () => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    handleTraceCommand(['list'])
    // Should output something (even if "No traces found")
    expect(consoleLogSpy).toHaveBeenCalled()
  })

  it('trace (no subcommand) defaults to list', () => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    handleTraceCommand([])
    expect(consoleLogSpy).toHaveBeenCalled()
  })

  it('trace list --all works', () => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    handleTraceCommand(['list', '--all'])
    expect(consoleLogSpy).toHaveBeenCalled()
  })

  it('trace list --limit 5 works', () => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    handleTraceCommand(['list', '--limit', '5'])
    expect(consoleLogSpy).toHaveBeenCalled()
  })

  it('trace show without runId shows usage error', () => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    handleTraceCommand(['show'])
    expect(consoleErrorSpy).toHaveBeenCalled()
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('Usage')
    expect(process.exitCode).toBe(1)
  })

  it('trace show <nonexistent> shows not found', () => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    handleTraceCommand(['show', 'nonexistent-run-id'])
    expect(consoleErrorSpy).toHaveBeenCalled()
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('Trace not found')
    expect(process.exitCode).toBe(1)
  })

  it('trace bogus shows unknown subcommand error', () => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    handleTraceCommand(['bogus'])
    expect(consoleErrorSpy).toHaveBeenCalled()
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('Unknown trace subcommand')
    expect(process.exitCode).toBe(1)
  })
})

describe('CLI: runCli trace routing', () => {
  // Test that argv with 'trace' prefix gets intercepted before cac
  // by checking that the function doesn't throw and produces expected output

  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    consoleLogSpy?.mockRestore()
    consoleErrorSpy?.mockRestore()
    process.exitCode = undefined
  })

  it('runCli with trace list does not trigger single-shot fallback', async () => {
    const { runCli } = await import('../src/cli/index.js')
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await runCli(['node', 'codelord', 'trace', 'list'])

    const allOutput = [
      ...consoleLogSpy.mock.calls.map((c) => c.join(' ')),
      ...consoleErrorSpy.mock.calls.map((c) => c.join(' ')),
    ].join('\n')
    expect(allOutput).not.toContain('Single-shot mode has been removed')
  })

  it('runCli with trace show does not trigger single-shot fallback', async () => {
    const { runCli } = await import('../src/cli/index.js')
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await runCli(['node', 'codelord', 'trace', 'show', 'fake-id'])

    const allOutput = [
      ...consoleLogSpy.mock.calls.map((c) => c.join(' ')),
      ...consoleErrorSpy.mock.calls.map((c) => c.join(' ')),
    ].join('\n')
    expect(allOutput).not.toContain('Single-shot mode has been removed')
    expect(allOutput).toContain('Trace not found')
  })
})
