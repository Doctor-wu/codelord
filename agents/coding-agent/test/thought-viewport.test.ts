import { describe, it, expect } from 'vite-plus/test'
import { extractThoughtViewport, sanitizeOperatorHint } from '../src/renderer/ink/summarize.js'

describe('extractThoughtViewport', () => {
  it('returns empty array for empty string', () => {
    expect(extractThoughtViewport('')).toEqual([])
  })

  it('returns all lines when fewer than maxLines', () => {
    const thought = 'line 1\nline 2\nline 3'
    expect(extractThoughtViewport(thought, 5)).toEqual(['line 1', 'line 2', 'line 3'])
  })

  it('returns exactly maxLines lines', () => {
    const thought = 'a\nb\nc\nd\ne'
    expect(extractThoughtViewport(thought, 5)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('returns last 5 lines when more than 5', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`)
    const thought = lines.join('\n')
    expect(extractThoughtViewport(thought, 5)).toEqual(['line 6', 'line 7', 'line 8', 'line 9', 'line 10'])
  })

  it('trims trailing empty lines', () => {
    const thought = 'line 1\nline 2\n\n\n'
    expect(extractThoughtViewport(thought, 5)).toEqual(['line 1', 'line 2'])
  })

  it('handles single line', () => {
    expect(extractThoughtViewport('hello world', 5)).toEqual(['hello world'])
  })

  it('respects custom maxLines', () => {
    const thought = 'a\nb\nc\nd\ne\nf'
    expect(extractThoughtViewport(thought, 3)).toEqual(['d', 'e', 'f'])
  })

  it('rolling window follows latest content', () => {
    // Simulate progressive accumulation
    let thought = 'step 1'
    expect(extractThoughtViewport(thought, 3)).toEqual(['step 1'])

    thought += '\nstep 2'
    expect(extractThoughtViewport(thought, 3)).toEqual(['step 1', 'step 2'])

    thought += '\nstep 3'
    expect(extractThoughtViewport(thought, 3)).toEqual(['step 1', 'step 2', 'step 3'])

    thought += '\nstep 4'
    expect(extractThoughtViewport(thought, 3)).toEqual(['step 2', 'step 3', 'step 4'])

    thought += '\nstep 5'
    expect(extractThoughtViewport(thought, 3)).toEqual(['step 3', 'step 4', 'step 5'])
  })

  it('handles very long lines without breaking', () => {
    const longLine = 'x'.repeat(500)
    const thought = `short\n${longLine}\nend`
    const result = extractThoughtViewport(thought, 5)
    expect(result).toHaveLength(3)
    expect(result[1]).toBe(longLine)
  })
})

describe('sanitizeOperatorHint', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeOperatorHint('')).toBe('')
  })

  it('collapses newlines into spaces', () => {
    expect(sanitizeOperatorHint('line one\nline two\nline three')).toBe('line one line two line three')
  })

  it('collapses tabs into spaces', () => {
    expect(sanitizeOperatorHint('before\tafter')).toBe('before after')
  })

  it('collapses multiple spaces into one', () => {
    expect(sanitizeOperatorHint('too   many    spaces')).toBe('too many spaces')
  })

  it('collapses mixed whitespace', () => {
    expect(sanitizeOperatorHint('a\n\n  b\t\tc')).toBe('a b c')
  })

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeOperatorHint('  hello  ')).toBe('hello')
  })

  it('truncates to maxLen with ellipsis', () => {
    const long = 'a'.repeat(100)
    const result = sanitizeOperatorHint(long, 20)
    expect(result.length).toBe(20)
    expect(result.endsWith('…')).toBe(true)
  })

  it('does not truncate when within maxLen', () => {
    expect(sanitizeOperatorHint('short text', 80)).toBe('short text')
  })

  it('handles real multiline reasoning text', () => {
    const raw = 'I need to check the file structure.\nLet me look at package.json first.\nThen I will check tsconfig.'
    const result = sanitizeOperatorHint(raw)
    expect(result).not.toContain('\n')
    expect(result).toContain('I need to check')
    expect(result).toContain('package.json')
  })
})
