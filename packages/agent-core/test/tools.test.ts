import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFileReadHandler } from '../src/tools/file-read.js'
import { createFileWriteHandler } from '../src/tools/file-write.js'
import { createFileEditHandler } from '../src/tools/file-edit.js'
import { createLsHandler } from '../src/tools/ls.js'
import { createSearchHandler } from '../src/tools/search.js'

const noopContext = { emitOutput: () => {} }

// ---------------------------------------------------------------------------
// Shared temp directory
// ---------------------------------------------------------------------------

let testDir: string

beforeEach(() => {
  testDir = join(tmpdir(), `codelord-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(testDir, { recursive: true })
})

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// file_read
// ---------------------------------------------------------------------------

describe('file_read', () => {
  it('reads a file successfully with isError=false', async () => {
    writeFileSync(join(testDir, 'hello.txt'), 'line1\nline2\nline3\n')
    const handler = createFileReadHandler({ cwd: testDir })
    const result = await handler({ file_path: 'hello.txt' }, noopContext)
    expect(result.isError).toBe(false)
    expect(result.output).toContain('1\tline1')
    expect(result.output).toContain('2\tline2')
  })

  it('supports offset and limit', async () => {
    writeFileSync(join(testDir, 'lines.txt'), 'a\nb\nc\nd\ne\n')
    const handler = createFileReadHandler({ cwd: testDir })
    const result = await handler({ file_path: 'lines.txt', offset: 2, limit: 2 }, noopContext)
    expect(result.isError).toBe(false)
    expect(result.output).toContain('2\tb')
    expect(result.output).toContain('3\tc')
    expect(result.output).not.toContain('1\ta')
  })

  it('returns isError=true with NOT_FOUND for missing file', async () => {
    const handler = createFileReadHandler({ cwd: testDir })
    const result = await handler({ file_path: 'nope.txt' }, noopContext)
    expect(result.isError).toBe(true)
    expect(result.errorCode).toBe('NOT_FOUND')
    expect(result.output).toContain('ERROR [NOT_FOUND]')
  })

  it('returns isError=true with INVALID_ARGS for missing file_path', async () => {
    const handler = createFileReadHandler({ cwd: testDir })
    const result = await handler({}, noopContext)
    expect(result.isError).toBe(true)
    expect(result.errorCode).toBe('INVALID_ARGS')
  })
})

// ---------------------------------------------------------------------------
// file_write
// ---------------------------------------------------------------------------

describe('file_write', () => {
  it('creates a new file with isError=false', async () => {
    const handler = createFileWriteHandler({ cwd: testDir })
    const result = await handler({ file_path: 'new.txt', content: 'hello\nworld' }, noopContext)
    expect(result.isError).toBe(false)
    expect(result.output).toContain('OK')
    expect(readFileSync(join(testDir, 'new.txt'), 'utf-8')).toBe('hello\nworld')
  })

  it('overwrites an existing file', async () => {
    writeFileSync(join(testDir, 'exist.txt'), 'old')
    const handler = createFileWriteHandler({ cwd: testDir })
    const result = await handler({ file_path: 'exist.txt', content: 'new' }, noopContext)
    expect(result.isError).toBe(false)
    expect(readFileSync(join(testDir, 'exist.txt'), 'utf-8')).toBe('new')
  })

  it('creates parent directories when create_directories is true', async () => {
    const handler = createFileWriteHandler({ cwd: testDir })
    const result = await handler({
      file_path: 'sub/dir/file.txt',
      content: 'deep',
      create_directories: true,
    }, noopContext)
    expect(result.isError).toBe(false)
  })

  it('returns isError=true with NOT_FOUND when parent dir missing', async () => {
    const handler = createFileWriteHandler({ cwd: testDir })
    const result = await handler({ file_path: 'missing/dir/file.txt', content: 'x' }, noopContext)
    expect(result.isError).toBe(true)
    expect(result.errorCode).toBe('NOT_FOUND')
  })

  it('returns isError=true with INVALID_ARGS for missing content', async () => {
    const handler = createFileWriteHandler({ cwd: testDir })
    const result = await handler({ file_path: 'x.txt' }, noopContext)
    expect(result.isError).toBe(true)
    expect(result.errorCode).toBe('INVALID_ARGS')
  })
})

// ---------------------------------------------------------------------------
// file_edit — isError semantics are critical here
// ---------------------------------------------------------------------------

describe('file_edit', () => {
  it('replaces exactly one occurrence with isError=false', async () => {
    writeFileSync(join(testDir, 'code.ts'), 'const x = 1;\nconst y = 2;\n')
    const handler = createFileEditHandler({ cwd: testDir })
    const result = await handler({
      file_path: 'code.ts',
      old_string: 'const x = 1;',
      new_string: 'const x = 42;',
    }, noopContext)
    expect(result.isError).toBe(false)
    expect(result.output).toContain('OK')
    expect(readFileSync(join(testDir, 'code.ts'), 'utf-8')).toBe('const x = 42;\nconst y = 2;\n')
  })

  it('NO_MATCH returns isError=true', async () => {
    writeFileSync(join(testDir, 'code.ts'), 'const x = 1;\n')
    const handler = createFileEditHandler({ cwd: testDir })
    const result = await handler({
      file_path: 'code.ts',
      old_string: 'not here',
      new_string: 'whatever',
    }, noopContext)
    expect(result.isError).toBe(true)
    expect(result.errorCode).toBe('NO_MATCH')
    expect(result.output).toContain('ERROR [NO_MATCH]')
    expect(readFileSync(join(testDir, 'code.ts'), 'utf-8')).toBe('const x = 1;\n')
  })

  it('MULTI_MATCH returns isError=true', async () => {
    writeFileSync(join(testDir, 'dup.ts'), 'foo\nfoo\nbar\n')
    const handler = createFileEditHandler({ cwd: testDir })
    const result = await handler({
      file_path: 'dup.ts',
      old_string: 'foo',
      new_string: 'baz',
    }, noopContext)
    expect(result.isError).toBe(true)
    expect(result.errorCode).toBe('MULTI_MATCH')
    expect(result.output).toContain('2 times')
    expect(readFileSync(join(testDir, 'dup.ts'), 'utf-8')).toBe('foo\nfoo\nbar\n')
  })

  it('NOT_FOUND returns isError=true for missing file', async () => {
    const handler = createFileEditHandler({ cwd: testDir })
    const result = await handler({
      file_path: 'nope.ts',
      old_string: 'x',
      new_string: 'y',
    }, noopContext)
    expect(result.isError).toBe(true)
    expect(result.errorCode).toBe('NOT_FOUND')
  })
})

// ---------------------------------------------------------------------------
// ls
// ---------------------------------------------------------------------------

describe('ls', () => {
  it('lists directory contents with isError=false', async () => {
    writeFileSync(join(testDir, 'a.txt'), '')
    writeFileSync(join(testDir, 'b.ts'), '')
    mkdirSync(join(testDir, 'sub'))
    const handler = createLsHandler({ cwd: testDir })
    const result = await handler({}, noopContext)
    expect(result.isError).toBe(false)
    expect(result.output).toContain('a.txt')
    expect(result.output).toContain('sub/')
  })

  it('empty directory returns isError=false', async () => {
    const handler = createLsHandler({ cwd: testDir })
    const result = await handler({}, noopContext)
    expect(result.isError).toBe(false)
    expect(result.output).toContain('(empty)')
  })

  it('filters by glob', async () => {
    writeFileSync(join(testDir, 'a.txt'), '')
    writeFileSync(join(testDir, 'b.ts'), '')
    const handler = createLsHandler({ cwd: testDir })
    const result = await handler({ glob: '*.ts' }, noopContext)
    expect(result.isError).toBe(false)
    expect(result.output).toContain('b.ts')
    expect(result.output).not.toContain('a.txt')
  })

  it('filters by type', async () => {
    writeFileSync(join(testDir, 'file.txt'), '')
    mkdirSync(join(testDir, 'dir'))
    const handler = createLsHandler({ cwd: testDir })

    const filesOnly = await handler({ type: 'file' }, noopContext)
    expect(filesOnly.isError).toBe(false)
    expect(filesOnly.output).toContain('file.txt')
    expect(filesOnly.output).not.toContain('dir/')

    const dirsOnly = await handler({ type: 'dir' }, noopContext)
    expect(dirsOnly.isError).toBe(false)
    expect(dirsOnly.output).toContain('dir/')
  })

  it('supports recursive listing', async () => {
    mkdirSync(join(testDir, 'a/b'), { recursive: true })
    writeFileSync(join(testDir, 'a/b/deep.txt'), '')
    const handler = createLsHandler({ cwd: testDir })
    const result = await handler({ recursive: true }, noopContext)
    expect(result.isError).toBe(false)
    expect(result.output).toContain('a/b/deep.txt')
  })

  it('returns isError=true with NOT_FOUND for missing directory', async () => {
    const handler = createLsHandler({ cwd: testDir })
    const result = await handler({ path: 'nope' }, noopContext)
    expect(result.isError).toBe(true)
    expect(result.errorCode).toBe('NOT_FOUND')
  })
})

// ---------------------------------------------------------------------------
// search — "no matches" is NOT an error
// ---------------------------------------------------------------------------

describe('search', () => {
  it('finds matching lines with isError=false', async () => {
    writeFileSync(join(testDir, 'code.ts'), 'const foo = 1;\nconst bar = 2;\nconst foo_bar = 3;\n')
    const handler = createSearchHandler({ cwd: testDir })
    const result = await handler({ query: 'foo', path: testDir }, noopContext)
    expect(result.isError).toBe(false)
    expect(result.output).toContain('foo')
    expect(result.output).toContain('code.ts')
  })

  it('no matches returns isError=false (not an error)', async () => {
    writeFileSync(join(testDir, 'empty.ts'), 'nothing here\n')
    const handler = createSearchHandler({ cwd: testDir })
    const result = await handler({ query: 'zzz_not_found_zzz', path: testDir }, noopContext)
    expect(result.isError).toBe(false)
    expect(result.output).toContain('No matches found')
  })

  it('returns isError=true with INVALID_ARGS for missing query', async () => {
    const handler = createSearchHandler({ cwd: testDir })
    const result = await handler({}, noopContext)
    expect(result.isError).toBe(true)
    expect(result.errorCode).toBe('INVALID_ARGS')
  })
})

// ---------------------------------------------------------------------------
// Path resolution — .. and relative paths
// ---------------------------------------------------------------------------

describe('path resolution with .. and relative paths', () => {
  it('file_read resolves .. correctly', async () => {
    mkdirSync(join(testDir, 'sub'), { recursive: true })
    writeFileSync(join(testDir, 'root.txt'), 'hello\n')
    const handler = createFileReadHandler({ cwd: join(testDir, 'sub') })
    const result = await handler({ file_path: '../root.txt' }, noopContext)
    expect(result.isError).toBe(false)
    expect(result.output).toContain('hello')
  })

  it('file_write resolves .. correctly', async () => {
    mkdirSync(join(testDir, 'sub'), { recursive: true })
    const handler = createFileWriteHandler({ cwd: join(testDir, 'sub') })
    const result = await handler({ file_path: '../written.txt', content: 'ok' }, noopContext)
    expect(result.isError).toBe(false)
    expect(readFileSync(join(testDir, 'written.txt'), 'utf-8')).toBe('ok')
  })

  it('file_edit resolves .. correctly', async () => {
    mkdirSync(join(testDir, 'sub'), { recursive: true })
    writeFileSync(join(testDir, 'edit-me.txt'), 'old value\n')
    const handler = createFileEditHandler({ cwd: join(testDir, 'sub') })
    const result = await handler({ file_path: '../edit-me.txt', old_string: 'old value', new_string: 'new value' }, noopContext)
    expect(result.isError).toBe(false)
    expect(readFileSync(join(testDir, 'edit-me.txt'), 'utf-8')).toBe('new value\n')
  })

  it('ls resolves .. correctly', async () => {
    mkdirSync(join(testDir, 'sub'), { recursive: true })
    writeFileSync(join(testDir, 'top.txt'), '')
    const handler = createLsHandler({ cwd: join(testDir, 'sub') })
    const result = await handler({ path: '..' }, noopContext)
    expect(result.isError).toBe(false)
    expect(result.output).toContain('top.txt')
  })
})
