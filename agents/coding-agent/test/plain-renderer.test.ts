import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlainTextRenderer } from '../src/renderer/plain-renderer.js'

describe('PlainTextRenderer', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prints thinking and normal text with separate labels', () => {
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const renderer = new PlainTextRenderer()

    renderer.onEvent({ type: 'thinking_delta', delta: 'Inspecting files...' } as never)
    renderer.onEvent({ type: 'thinking_end', text: 'Inspecting files...' } as never)
    renderer.onEvent({ type: 'text_delta', delta: 'I found the config issue.' } as never)
    renderer.onEvent({ type: 'text_end', text: 'I found the config issue.' } as never)

    const output = stdoutWrite.mock.calls.map(([value]) => String(value)).join('')
    expect(output).toContain('[thinking] ')
    expect(output).toContain('Inspecting files...')
    expect(output).toContain('[assistant] ')
    expect(output).toContain('I found the config issue.')
  })
})
