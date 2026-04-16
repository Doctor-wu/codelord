import { describe, expect, it } from 'vite-plus/test'
import { extractToolCommand, formatToolDisplayName } from '../src/renderer/tool-display.js'

describe('formatToolDisplayName', () => {
  it('maps bash to Bash', () => {
    expect(formatToolDisplayName('bash')).toBe('Bash')
  })

  it('maps file_read to Read', () => {
    expect(formatToolDisplayName('file_read')).toBe('Read')
  })

  it('maps file_write to Write', () => {
    expect(formatToolDisplayName('file_write')).toBe('Write')
  })

  it('maps file_edit to Edit', () => {
    expect(formatToolDisplayName('file_edit')).toBe('Edit')
  })

  it('maps search to Search', () => {
    expect(formatToolDisplayName('search')).toBe('Search')
  })

  it('maps ls to Ls', () => {
    expect(formatToolDisplayName('ls')).toBe('Ls')
  })

  it('capitalizes unknown tool names', () => {
    expect(formatToolDisplayName('custom_tool')).toBe('Custom_tool')
  })
})

describe('extractToolCommand', () => {
  it('extracts bash command', () => {
    expect(extractToolCommand('bash', { command: 'ls -la' })).toBe('ls -la')
  })

  it('extracts file_read file_path', () => {
    expect(extractToolCommand('file_read', { file_path: '/src/index.ts' })).toBe('/src/index.ts')
  })

  it('extracts file_write file_path', () => {
    expect(extractToolCommand('file_write', { file_path: 'out.txt', content: 'hello' })).toBe('out.txt')
  })

  it('extracts file_edit file_path', () => {
    expect(extractToolCommand('file_edit', { file_path: 'code.ts', old_string: 'a', new_string: 'b' })).toBe('code.ts')
  })

  it('extracts search query', () => {
    expect(extractToolCommand('search', { query: 'TODO' })).toBe('TODO')
  })

  it('extracts search query with path and glob', () => {
    expect(extractToolCommand('search', { query: 'TODO', path: 'src', glob: '*.ts' })).toBe('TODO in src --glob *.ts')
  })

  it('extracts ls path', () => {
    expect(extractToolCommand('ls', { path: 'src' })).toBe('src')
  })

  it('defaults ls to .', () => {
    expect(extractToolCommand('ls', {})).toBe('.')
  })

  it('appends ls flags', () => {
    expect(extractToolCommand('ls', { path: 'src', recursive: true, glob: '*.ts' })).toBe('src --recursive --glob *.ts')
  })

  it('falls back to toolName when args are missing (streaming)', () => {
    expect(extractToolCommand('file_read', {})).toBe('file_read')
    expect(extractToolCommand('search', {})).toBe('search')
  })

  it('falls back for unknown tools', () => {
    expect(extractToolCommand('custom', { command: 'do stuff' })).toBe('do stuff')
    expect(extractToolCommand('custom', {})).toBe('custom')
  })
})
