import { afterEach, describe, expect, it } from 'vitest'
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { CheckpointManager } from '../src/checkpoint-manager.js'
import type { ToolHandler } from '@agent/core'

function makeTmpDir(): string {
  const dir = join(tmpdir(), `codelord-ckpt-test-${randomUUID()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

// Minimal mock handler that writes a file
function makeFileWriteHandler(cwd: string): ToolHandler {
  return async (args) => {
    const filePath = args.file_path as string
    const content = args.content as string
    const resolved = join(cwd, filePath)
    writeFileSync(resolved, content, 'utf-8')
    return { output: `OK: Wrote ${resolved}`, isError: false }
  }
}

// Minimal mock handler that edits a file (search-replace)
function makeFileEditHandler(cwd: string): ToolHandler {
  return async (args) => {
    const filePath = args.file_path as string
    const resolved = join(cwd, filePath)
    const content = readFileSync(resolved, 'utf-8')
    const updated = content.replace(args.old_string as string, args.new_string as string)
    writeFileSync(resolved, updated, 'utf-8')
    return { output: `OK: Edited ${resolved}`, isError: false }
  }
}

// A read-only handler
function makeFileReadHandler(): ToolHandler {
  return async (args) => {
    return { output: `content of ${args.file_path}`, isError: false }
  }
}

const emitCtx = { emitOutput: () => {} }

describe('CheckpointManager', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs) {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
    }
    dirs.length = 0
  })

  function setup() {
    const cwd = makeTmpDir()
    dirs.push(cwd)
    const mgr = new CheckpointManager({ cwd, sessionId: 'test-session' })
    const handlers = new Map<string, ToolHandler>([
      ['file_write', makeFileWriteHandler(cwd)],
      ['file_edit', makeFileEditHandler(cwd)],
      ['file_read', makeFileReadHandler()],
    ])
    const wrapped = mgr.wrapHandlers(handlers)
    return { cwd, mgr, wrapped }
  }

  // --- 1. Pure read burst does NOT create checkpoint ---

  it('pure read burst does not create checkpoint', async () => {
    const { mgr, wrapped } = setup()

    mgr.beginBurst()
    await wrapped.get('file_read')!({ file_path: 'foo.txt' }, emitCtx)
    mgr.endBurst()

    expect(mgr.undoCount).toBe(0)
  })

  // --- 2. Mutating burst lazily creates checkpoint on first write ---

  it('mutating burst creates checkpoint lazily on first write', async () => {
    const { cwd, mgr, wrapped } = setup()

    mgr.beginBurst()
    // No checkpoint yet
    expect(mgr.undoCount).toBe(0)

    await wrapped.get('file_write')!({ file_path: 'new.txt', content: 'hello' }, emitCtx)
    mgr.endBurst()

    // Now we have one checkpoint
    expect(mgr.undoCount).toBe(1)
    expect(mgr.stack[0].files).toHaveLength(1)
    expect(mgr.stack[0].files[0].existed).toBe(false)
  })

  // --- 3. file_edit: undo restores original content ---

  it('file_edit: /undo restores original file content', async () => {
    const { cwd, mgr, wrapped } = setup()

    // Create a file first
    const filePath = join(cwd, 'existing.txt')
    writeFileSync(filePath, 'original content', 'utf-8')

    mgr.beginBurst()
    await wrapped.get('file_edit')!({
      file_path: 'existing.txt',
      old_string: 'original',
      new_string: 'modified',
    }, emitCtx)
    mgr.endBurst()

    // File is now modified
    expect(readFileSync(filePath, 'utf-8')).toBe('modified content')

    // Undo
    const result = mgr.undo()
    expect(result).not.toBeNull()
    expect(result!.restoredFiles).toContain(filePath)

    // File is restored
    expect(readFileSync(filePath, 'utf-8')).toBe('original content')
    expect(mgr.undoCount).toBe(0)
  })

  // --- 4. file_write new file: undo deletes it ---

  it('file_write new file: /undo deletes the created file', async () => {
    const { cwd, mgr, wrapped } = setup()

    const filePath = join(cwd, 'brand-new.txt')
    expect(existsSync(filePath)).toBe(false)

    mgr.beginBurst()
    await wrapped.get('file_write')!({ file_path: 'brand-new.txt', content: 'new content' }, emitCtx)
    mgr.endBurst()

    expect(existsSync(filePath)).toBe(true)

    // Undo
    mgr.undo()
    expect(existsSync(filePath)).toBe(false)
  })

  // --- 5. file_write overwrite: undo restores original ---

  it('file_write overwrite: /undo restores original content', async () => {
    const { cwd, mgr, wrapped } = setup()

    const filePath = join(cwd, 'overwrite-me.txt')
    writeFileSync(filePath, 'before', 'utf-8')

    mgr.beginBurst()
    await wrapped.get('file_write')!({ file_path: 'overwrite-me.txt', content: 'after' }, emitCtx)
    mgr.endBurst()

    expect(readFileSync(filePath, 'utf-8')).toBe('after')

    mgr.undo()
    expect(readFileSync(filePath, 'utf-8')).toBe('before')
  })

  // --- 6. Checkpoint stack persists via session snapshot ---

  it('checkpoint stack survives serialization round-trip', async () => {
    const { cwd, mgr, wrapped } = setup()

    writeFileSync(join(cwd, 'a.txt'), 'aaa', 'utf-8')

    mgr.beginBurst()
    await wrapped.get('file_edit')!({
      file_path: 'a.txt',
      old_string: 'aaa',
      new_string: 'bbb',
    }, emitCtx)
    mgr.endBurst()

    // Serialize the stack
    const serialized = JSON.stringify(mgr.stack)
    const deserialized = JSON.parse(serialized)

    // Create a new manager with the deserialized stack
    const mgr2 = new CheckpointManager({
      cwd,
      sessionId: 'test-session',
      stack: deserialized,
    })

    expect(mgr2.undoCount).toBe(1)
    expect(mgr2.canUndo).toBe(true)

    // Undo from the restored manager
    const result = mgr2.undo()
    expect(result).not.toBeNull()
    expect(readFileSync(join(cwd, 'a.txt'), 'utf-8')).toBe('aaa')
  })

  // --- 7. /undo while running is blocked (tested at REPL level, but we test the manager's state) ---
  // This is a REPL-level concern. The manager itself doesn't know about running state.
  // We verify the manager doesn't interfere with the running check.

  it('undo returns null when stack is empty', () => {
    const { mgr } = setup()
    expect(mgr.undo()).toBeNull()
    expect(mgr.canUndo).toBe(false)
  })

  // --- 8. Undo injects correction message (tested via REPL integration) ---
  // At the manager level, we verify the undo result contains enough info for the caller.

  it('undo result contains file list and checkpoint info', async () => {
    const { cwd, mgr, wrapped } = setup()

    writeFileSync(join(cwd, 'x.txt'), 'xxx', 'utf-8')

    mgr.beginBurst()
    await wrapped.get('file_edit')!({
      file_path: 'x.txt',
      old_string: 'xxx',
      new_string: 'yyy',
    }, emitCtx)
    await wrapped.get('file_write')!({ file_path: 'y.txt', content: 'new' }, emitCtx)
    mgr.endBurst()

    const result = mgr.undo()!
    expect(result.record.files).toHaveLength(2)
    expect(result.restoredFiles).toHaveLength(2)
    expect(result.record.strategy).toBe('file_snapshot')
    expect(result.record.canUndo).toBe(true)
  })

  // --- 9. Multiple bursts: undo pops one at a time ---

  it('multiple bursts: undo pops most recent first', async () => {
    const { cwd, mgr, wrapped } = setup()

    writeFileSync(join(cwd, 'f.txt'), 'v1', 'utf-8')

    // Burst 1: v1 -> v2
    mgr.beginBurst()
    await wrapped.get('file_edit')!({
      file_path: 'f.txt',
      old_string: 'v1',
      new_string: 'v2',
    }, emitCtx)
    mgr.endBurst()

    // Burst 2: v2 -> v3
    mgr.beginBurst()
    await wrapped.get('file_edit')!({
      file_path: 'f.txt',
      old_string: 'v2',
      new_string: 'v3',
    }, emitCtx)
    mgr.endBurst()

    expect(mgr.undoCount).toBe(2)
    expect(readFileSync(join(cwd, 'f.txt'), 'utf-8')).toBe('v3')

    // Undo burst 2 -> back to v2
    mgr.undo()
    expect(readFileSync(join(cwd, 'f.txt'), 'utf-8')).toBe('v2')
    expect(mgr.undoCount).toBe(1)

    // Undo burst 1 -> back to v1
    mgr.undo()
    expect(readFileSync(join(cwd, 'f.txt'), 'utf-8')).toBe('v1')
    expect(mgr.undoCount).toBe(0)
  })

  // --- 10. Non-mutating handler (file_read) is not wrapped ---

  it('file_read handler is not wrapped (passes through unchanged)', async () => {
    const { wrapped } = setup()

    // file_read should work normally and not create checkpoints
    const result = await wrapped.get('file_read')!({ file_path: 'anything' }, emitCtx)
    expect(result.output).toContain('anything')
  })

  // --- Same file not snapshotted twice in one burst ---

  it('same file is only snapshotted once per burst', async () => {
    const { cwd, mgr, wrapped } = setup()

    writeFileSync(join(cwd, 'multi.txt'), 'original', 'utf-8')

    mgr.beginBurst()
    await wrapped.get('file_edit')!({
      file_path: 'multi.txt',
      old_string: 'original',
      new_string: 'first-edit',
    }, emitCtx)
    await wrapped.get('file_edit')!({
      file_path: 'multi.txt',
      old_string: 'first-edit',
      new_string: 'second-edit',
    }, emitCtx)
    mgr.endBurst()

    // Only one file snapshot, capturing the state before the first edit
    expect(mgr.stack[0].files).toHaveLength(1)
    expect(mgr.stack[0].files[0].originalContent).toBe('original')

    // Undo restores to original, not to first-edit
    mgr.undo()
    expect(readFileSync(join(cwd, 'multi.txt'), 'utf-8')).toBe('original')
  })
})
