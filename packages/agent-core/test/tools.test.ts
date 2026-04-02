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
  it('reads a file and returns numbered lines', async () => {
    writeFileSync(join(testDir, 'hello.txt'), 'line1\nline2\nline3\n')
    const handler = createFileReadHandler({ cwd: testDir })
    const result = await handler({ file_path: 'hello.txt' }, noopContext)
    expect(result).toContain('hello.txt')
    expect(result).toContain('1\tline1')
    expect(result).toContain('2\tline2')
    expect(result).toContain('3\tline3')
  })

  it('supports offset and limit', async () => {
    writeFileSync(join(testDir, 'lines.txt'), 'a\nb\nc\nd\ne\n')
    const handler = createFileReadHandler({ cwd: testDir })
    const result = await handler({ file_path: 'lines.txt', offset: 2, limit: 2 }, noopContext)
    expect(result).toContain('2\tb')
    expect(result).toContain('3\tc')
    expect(result).not.toContain('1\ta')
    expect(result).not.toContain('4\td')
  })

  it('returns NOT_FOUND for missing file', async () => {
    const handler = createFileReadHandler({ cwd: testDir })
    const result = await handler({ file_path: 'nope.txt' }, noopContext)
    expect(result).toContain('ERROR [NOT_FOUND]')
  })

  it('returns INVALID_ARGS for missing file_path', async () => {
    const handler = createFileReadHandler({ cwd: testDir })
    const result = await handler({}, noopContext)
    expect(result).toContain('ERROR [INVALID_ARGS]')
  })
})

// ---------------------------------------------------------------------------
// file_write
// ---------------------------------------------------------------------------

describe('file_write', () => {
  it('creates a new file', async () => {
    const handler = createFileWriteHandler({ cwd: testDir })
    const result = await handler({ file_path: 'new.txt', content: 'hello\nworld' }, noopContext)
    expect(result).toContain('OK')
    expect(readFileSync(join(testDir, 'new.txt'), 'utf-8')).toBe('hello\nworld')
  })

  it('overwrites an existing file', async () => {
    writeFileSync(join(testDir, 'exist.txt'), 'old')
    const handler = createFileWriteHandler({ cwd: testDir })
    await handler({ file_path: 'exist.txt', content: 'new' }, noopContext)
    expect(readFileSync(join(testDir, 'exist.txt'), 'utf-8')).toBe('new')
  })

  it('creates parent directories when create_directories is true', async () => {
    const handler = createFileWriteHandler({ cwd: testDir })
    const result = await handler({
      file_path: 'sub/dir/file.txt',
      content: 'deep',
      create_directories: true,
    }, noopContext)
    expect(result).toContain('OK')
    expect(readFileSync(join(testDir, 'sub/dir/file.txt'), 'utf-8')).toBe('deep')
  })

  it('returns NOT_FOUND when parent dir missing and create_directories is false', async () => {
    const handler = createFileWriteHandler({ cwd: testDir })
    const result = await handler({
      file_path: 'missing/dir/file.txt',
      content: 'x',
    }, noopContext)
    expect(result).toContain('ERROR [NOT_FOUND]')
  })

  it('returns INVALID_ARGS for missing content', async () => {
    const handler = createFileWriteHandler({ cwd: testDir })
    const result = await handler({ file_path: 'x.txt' }, noopContext)
    expect(result).toContain('ERROR [INVALID_ARGS]')
  })
})

// ---------------------------------------------------------------------------
// file_edit
// ---------------------------------------------------------------------------

describe('file_edit', () => {
  it('replaces exactly one occurrence', async () => {
    writeFileSync(join(testDir, 'code.ts'), 'const x = 1;\nconst y = 2;\n')
    const handler = createFileEditHandler({ cwd: testDir })
    const result = await handler({
      file_path: 'code.ts',
      old_string: 'const x = 1;',
      new_string: 'const x = 42;',
    }, noopContext)
    expect(result).toContain('OK')
    expect(readFileSync(join(testDir, 'code.ts'), 'utf-8')).toBe('const x = 42;\nconst y = 2;\n')
  })

  it('fails with NO_MATCH when old_string not found', async () => {
    writeFileSync(join(testDir, 'code.ts'), 'const x = 1;\n')
    const handler = createFileEditHandler({ cwd: testDir })
    const result = await handler({
      file_path: 'code.ts',
      old_string: 'not here',
      new_string: 'whatever',
    }, noopContext)
    expect(result).toContain('ERROR [NO_MATCH]')
    // File unchanged
    expect(readFileSync(join(testDir, 'code.ts'), 'utf-8')).toBe('const x = 1;\n')
  })

  it('fails with MULTI_MATCH when old_string found multiple times', async () => {
    writeFileSync(join(testDir, 'dup.ts'), 'foo\nfoo\nbar\n')
    const handler = createFileEditHandler({ cwd: testDir })
    const result = await handler({
      file_path: 'dup.ts',
      old_string: 'foo',
      new_string: 'baz',
    }, noopContext)
    expect(result).toContain('ERROR [MULTI_MATCH]')
    expect(result).toContain('2 times')
    // File unchanged
    expect(readFileSync(join(testDir, 'dup.ts'), 'utf-8')).toBe('foo\nfoo\nbar\n')
  })

  it('returns NOT_FOUND for missing file', async () => {
    const handler = createFileEditHandler({ cwd: testDir })
    const result = await handler({
      file_path: 'nope.ts',
      old_string: 'x',
      new_string: 'y',
    }, noopContext)
    expect(result).toContain('ERROR [NOT_FOUND]')
  })
})

// ---------------------------------------------------------------------------
// ls
// ---------------------------------------------------------------------------

describe('ls', () => {
  it('lists directory contents', async () => {
    writeFileSync(join(testDir, 'a.txt'), '')
    writeFileSync(join(testDir, 'b.ts'), '')
    mkdirSync(join(testDir, 'sub'))
    const handler = createLsHandler({ cwd: testDir })
    const result = await handler({}, noopContext)
    expect(result).toContain('a.txt')
    expect(result).toContain('b.ts')
    expect(result).toContain('sub/')
  })

  it('filters by glob', async () => {
    writeFileSync(join(testDir, 'a.txt'), '')
    writeFileSync(join(testDir, 'b.ts'), '')
    const handler = createLsHandler({ cwd: testDir })
    const result = await handler({ glob: '*.ts' }, noopContext)
    expect(result).toContain('b.ts')
    expect(result).not.toContain('a.txt')
  })

  it('filters by type', async () => {
    writeFileSync(join(testDir, 'file.txt'), '')
    mkdirSync(join(testDir, 'dir'))
    const handler = createLsHandler({ cwd: testDir })

    const filesOnly = await handler({ type: 'file' }, noopContext)
    expect(filesOnly).toContain('file.txt')
    expect(filesOnly).not.toContain('dir/')

    const dirsOnly = await handler({ type: 'dir' }, noopContext)
    expect(dirsOnly).toContain('dir/')
    expect(dirsOnly).not.toContain('file.txt')
  })

  it('supports recursive listing', async () => {
    mkdirSync(join(testDir, 'a/b'), { recursive: true })
    writeFileSync(join(testDir, 'a/b/deep.txt'), '')
    const handler = createLsHandler({ cwd: testDir })
    const result = await handler({ recursive: true }, noopContext)
    expect(result).toContain('a/b/deep.txt')
  })

  it('returns NOT_FOUND for missing directory', async () => {
    const handler = createLsHandler({ cwd: testDir })
    const result = await handler({ path: 'nope' }, noopContext)
    expect(result).toContain('ERROR [NOT_FOUND]')
  })
})

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

describe('search', () => {
  it('finds matching lines with file path and line number', async () => {
    writeFileSync(join(testDir, 'code.ts'), 'const foo = 1;\nconst bar = 2;\nconst foo_bar = 3;\n')
    const handler = createSearchHandler({ cwd: testDir })
    const result = await handler({ query: 'foo', path: testDir }, noopContext)
    expect(result).toContain('foo')
    expect(result).toContain('code.ts')
  })

  it('returns no matches message when nothing found', async () => {
    writeFileSync(join(testDir, 'empty.ts'), 'nothing here\n')
    const handler = createSearchHandler({ cwd: testDir })
    const result = await handler({ query: 'zzz_not_found_zzz', path: testDir }, noopContext)
    expect(result).toContain('No matches found')
  })

  it('returns INVALID_ARGS for missing query', async () => {
    const handler = createSearchHandler({ cwd: testDir })
    const result = await handler({}, noopContext)
    expect(result).toContain('ERROR [INVALID_ARGS]')
  })
})
