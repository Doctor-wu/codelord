import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vite-plus/test'
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { execSync } from 'node:child_process'
import { CheckpointManager } from '../src/checkpoint-manager.js'
import type { ToolHandler } from '../src/react-loop.js'

// ---------------------------------------------------------------------------
// Test isolation: override CODELORD_HOME so nothing leaks to ~/.codelord/
// ---------------------------------------------------------------------------

let savedCodelordHome: string | undefined
const testCodelordHome = join(tmpdir(), `codelord-test-home-${randomUUID()}`)

beforeAll(() => {
  savedCodelordHome = process.env.CODELORD_HOME
  process.env.CODELORD_HOME = testCodelordHome
})

afterAll(() => {
  if (savedCodelordHome === undefined) {
    delete process.env.CODELORD_HOME
  } else {
    process.env.CODELORD_HOME = savedCodelordHome
  }
  if (existsSync(testCodelordHome)) {
    rmSync(testCodelordHome, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  const dir = join(tmpdir(), `codelord-ckpt-test-${randomUUID()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function makeFileWriteHandler(cwd: string): ToolHandler {
  return async (args) => {
    const filePath = args.file_path as string
    const content = args.content as string
    const resolved = join(cwd, filePath)
    writeFileSync(resolved, content, 'utf-8')
    return { output: `OK: Wrote ${resolved}`, isError: false }
  }
}

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
    const wsDir = join(tmpdir(), `codelord-ws-test-${randomUUID()}`)
    mkdirSync(wsDir, { recursive: true })
    dirs.push(cwd, wsDir)

    const mgr = new CheckpointManager({ cwd, sessionId: 'test-session', workspaceDir: wsDir })
    const handlers = new Map<string, ToolHandler>([
      ['file_write', makeFileWriteHandler(cwd)],
      ['file_edit', makeFileEditHandler(cwd)],
      ['file_read', makeFileReadHandler()],
    ])
    const wrapped = mgr.wrapHandlers(handlers)
    return { cwd, wsDir, mgr, wrapped }
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
    const { mgr, wrapped } = setup()

    mgr.beginBurst()
    expect(mgr.undoCount).toBe(0)

    await wrapped.get('file_write')!({ file_path: 'new.txt', content: 'hello' }, emitCtx)
    mgr.endBurst()

    expect(mgr.undoCount).toBe(1)
    expect(mgr.stack[0].files).toHaveLength(1)
    expect(mgr.stack[0].files[0].existed).toBe(false)
  })

  // --- 3. file_edit: undo restores original content ---

  it('file_edit: /undo restores original file content', async () => {
    const { cwd, mgr, wrapped } = setup()

    const filePath = join(cwd, 'existing.txt')
    writeFileSync(filePath, 'original content', 'utf-8')

    mgr.beginBurst()
    await wrapped.get('file_edit')!(
      { file_path: 'existing.txt', old_string: 'original', new_string: 'modified' },
      emitCtx,
    )
    mgr.endBurst()

    expect(readFileSync(filePath, 'utf-8')).toBe('modified content')

    const result = mgr.undo()
    expect(result).not.toBeNull()
    expect(result!.restoredFiles).toContain(filePath)
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
    const { cwd, wsDir, mgr, wrapped } = setup()

    writeFileSync(join(cwd, 'a.txt'), 'aaa', 'utf-8')

    mgr.beginBurst()
    await wrapped.get('file_edit')!({ file_path: 'a.txt', old_string: 'aaa', new_string: 'bbb' }, emitCtx)
    mgr.endBurst()

    const serialized = JSON.stringify(mgr.stack)
    const deserialized = JSON.parse(serialized)

    const mgr2 = new CheckpointManager({
      cwd,
      sessionId: 'test-session',
      stack: deserialized,
      workspaceDir: wsDir,
    })

    expect(mgr2.undoCount).toBe(1)
    expect(mgr2.canUndo).toBe(true)

    const result = mgr2.undo()
    expect(result).not.toBeNull()
    expect(readFileSync(join(cwd, 'a.txt'), 'utf-8')).toBe('aaa')
  })

  it('undo returns null when stack is empty', () => {
    const { mgr } = setup()
    expect(mgr.undo()).toBeNull()
    expect(mgr.canUndo).toBe(false)
  })

  it('undo result contains file list and checkpoint info', async () => {
    const { cwd, mgr, wrapped } = setup()

    writeFileSync(join(cwd, 'x.txt'), 'xxx', 'utf-8')

    mgr.beginBurst()
    await wrapped.get('file_edit')!({ file_path: 'x.txt', old_string: 'xxx', new_string: 'yyy' }, emitCtx)
    await wrapped.get('file_write')!({ file_path: 'y.txt', content: 'new' }, emitCtx)
    mgr.endBurst()

    const result = mgr.undo()!
    expect(result.record.files).toHaveLength(2)
    expect(result.restoredFiles.length).toBeGreaterThanOrEqual(1)
    expect(result.record.strategy).toBe('hybrid')
    expect(result.record.canUndo).toBe(true)
  })

  // --- 9. Multiple bursts: undo pops one at a time ---

  it('multiple bursts: undo pops most recent first', async () => {
    const { cwd, mgr, wrapped } = setup()

    writeFileSync(join(cwd, 'f.txt'), 'v1', 'utf-8')

    mgr.beginBurst()
    await wrapped.get('file_edit')!({ file_path: 'f.txt', old_string: 'v1', new_string: 'v2' }, emitCtx)
    mgr.endBurst()

    mgr.beginBurst()
    await wrapped.get('file_edit')!({ file_path: 'f.txt', old_string: 'v2', new_string: 'v3' }, emitCtx)
    mgr.endBurst()

    expect(mgr.undoCount).toBe(2)
    expect(readFileSync(join(cwd, 'f.txt'), 'utf-8')).toBe('v3')

    mgr.undo()
    expect(readFileSync(join(cwd, 'f.txt'), 'utf-8')).toBe('v2')
    expect(mgr.undoCount).toBe(1)

    mgr.undo()
    expect(readFileSync(join(cwd, 'f.txt'), 'utf-8')).toBe('v1')
    expect(mgr.undoCount).toBe(0)
  })

  it('file_read handler is not wrapped (passes through unchanged)', async () => {
    const { wrapped } = setup()

    const result = await wrapped.get('file_read')!({ file_path: 'anything' }, emitCtx)
    expect(result.output).toContain('anything')
  })

  it('same file is only snapshotted once per burst', async () => {
    const { cwd, mgr, wrapped } = setup()

    writeFileSync(join(cwd, 'multi.txt'), 'original', 'utf-8')

    mgr.beginBurst()
    await wrapped.get('file_edit')!(
      { file_path: 'multi.txt', old_string: 'original', new_string: 'first-edit' },
      emitCtx,
    )
    await wrapped.get('file_edit')!(
      { file_path: 'multi.txt', old_string: 'first-edit', new_string: 'second-edit' },
      emitCtx,
    )
    mgr.endBurst()

    expect(mgr.stack[0].files).toHaveLength(1)
    expect(mgr.stack[0].files[0].originalContent).toBe('original')

    mgr.undo()
    expect(readFileSync(join(cwd, 'multi.txt'), 'utf-8')).toBe('original')
  })
})

// ---------------------------------------------------------------------------
// Git-aware checkpoint tests
// ---------------------------------------------------------------------------

function makeGitRepo(): string {
  const dir = join(tmpdir(), `codelord-git-ckpt-test-${randomUUID()}`)
  mkdirSync(dir, { recursive: true })
  execSync('git init', { cwd: dir, stdio: 'pipe' })
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' })
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' })
  writeFileSync(join(dir, 'init.txt'), 'init', 'utf-8')
  execSync('git add . && git commit -m "init"', { cwd: dir, stdio: 'pipe' })
  return dir
}

describe('CheckpointManager -- shadow git', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs) {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
    }
    dirs.length = 0
  })

  function setupGit(cwd?: string) {
    const dir = cwd ?? makeTmpDir()
    const wsDir = join(tmpdir(), `codelord-ws-test-${randomUUID()}`)
    mkdirSync(wsDir, { recursive: true })
    dirs.push(dir, wsDir)
    return { cwd: dir, wsDir }
  }

  it('beginBurst creates shadow git checkpoint when files change', () => {
    const { cwd, wsDir } = setupGit()

    writeFileSync(join(cwd, 'file.txt'), 'content', 'utf-8')

    const mgr = new CheckpointManager({ cwd, sessionId: 'test', workspaceDir: wsDir })
    const handlers = new Map<string, ToolHandler>([
      [
        'file_write',
        async (args) => {
          writeFileSync(join(cwd, args.file_path as string), args.content as string, 'utf-8')
          return { output: 'OK', isError: false }
        },
      ],
    ])
    mgr.wrapHandlers(handlers)

    mgr.beginBurst()
    expect(existsSync(join(cwd, 'file.txt'))).toBe(true)
    expect(readFileSync(join(cwd, 'file.txt'), 'utf-8')).toBe('content')

    writeFileSync(join(cwd, 'bash-created.txt'), 'bash', 'utf-8')

    const checkpoint = mgr.endBurst()
    expect(checkpoint).not.toBeNull()
    expect(checkpoint!.strategy).toBe('shadow_git')
    expect(checkpoint!.shadowGit).not.toBeNull()
    expect(checkpoint!.shadowGit!.commitHash).toMatch(/^[0-9a-f]{40}$/)
    expect(checkpoint!.files).toHaveLength(0)
  })

  it('shadow git checkpoint is non-destructive', () => {
    const gitCwd = makeGitRepo()
    const { wsDir } = setupGit()
    dirs.push(gitCwd)

    writeFileSync(join(gitCwd, 'dirty.txt'), 'uncommitted', 'utf-8')
    execSync('git add dirty.txt', { cwd: gitCwd, stdio: 'pipe' })

    const mgr = new CheckpointManager({ cwd: gitCwd, sessionId: 'test', workspaceDir: wsDir })
    mgr.beginBurst()

    expect(existsSync(join(gitCwd, 'dirty.txt'))).toBe(true)
    expect(readFileSync(join(gitCwd, 'dirty.txt'), 'utf-8')).toBe('uncommitted')

    const userStatus = execSync('git status --porcelain', { cwd: gitCwd, stdio: 'pipe' }).toString()
    expect(userStatus).toContain('dirty.txt')

    mgr.endBurst()
  })

  it('undo restores via shadow git reset', () => {
    const { cwd, wsDir } = setupGit()

    writeFileSync(join(cwd, 'original.txt'), 'before', 'utf-8')

    const mgr = new CheckpointManager({ cwd, sessionId: 'test', workspaceDir: wsDir })
    const handlers = new Map<string, ToolHandler>([
      [
        'file_write',
        async (args) => {
          writeFileSync(join(cwd, args.file_path as string), args.content as string, 'utf-8')
          return { output: 'OK', isError: false }
        },
      ],
    ])
    const wrapped = mgr.wrapHandlers(handlers)

    mgr.beginBurst()
    wrapped.get('file_write')!({ file_path: 'original.txt', content: 'modified' }, { emitOutput: () => {} })
    writeFileSync(join(cwd, 'new-by-bash.txt'), 'bash created', 'utf-8')
    const checkpoint = mgr.endBurst()
    expect(checkpoint).not.toBeNull()

    expect(readFileSync(join(cwd, 'original.txt'), 'utf-8')).toBe('modified')
    expect(existsSync(join(cwd, 'new-by-bash.txt'))).toBe(true)

    const result = mgr.undo()
    expect(result).not.toBeNull()
    expect(result!.gitRestored).toBe(true)

    expect(readFileSync(join(cwd, 'original.txt'), 'utf-8')).toBe('before')
    expect(existsSync(join(cwd, 'new-by-bash.txt'))).toBe(false)
  })

  it('shadow repo coexists with user git repo', () => {
    const gitCwd = makeGitRepo()
    const { wsDir } = setupGit()
    dirs.push(gitCwd)

    const userHead = execSync('git rev-parse HEAD', { cwd: gitCwd, stdio: 'pipe' }).toString().trim()

    writeFileSync(join(gitCwd, 'work.txt'), 'data', 'utf-8')

    const mgr = new CheckpointManager({ cwd: gitCwd, sessionId: 'test', workspaceDir: wsDir })
    mgr.beginBurst()
    mgr.endBurst()

    const userHeadAfter = execSync('git rev-parse HEAD', { cwd: gitCwd, stdio: 'pipe' }).toString().trim()
    expect(userHeadAfter).toBe(userHead)

    const stashList = execSync('git stash list', { cwd: gitCwd, stdio: 'pipe' }).toString().trim()
    expect(stashList).toBe('')
  })

  it('endBurst returns CheckpointRecord with correct shape', () => {
    const { cwd, wsDir } = setupGit()

    writeFileSync(join(cwd, 'data.txt'), 'data', 'utf-8')

    const mgr = new CheckpointManager({ cwd, sessionId: 'test', workspaceDir: wsDir })
    mgr.beginBurst()
    writeFileSync(join(cwd, 'data.txt'), 'modified', 'utf-8')
    const record = mgr.endBurst()

    expect(record).not.toBeNull()
    expect(record!.checkpointId).toBeTruthy()
    expect(record!.sessionId).toBe('test')
    expect(record!.burstIndex).toBe(1)
    expect(record!.canUndo).toBe(true)
    expect(record!.shadowGit!.commitHash).toMatch(/^[0-9a-f]{40}$/)
  })

  it('shadow git works even in non-git directory', () => {
    const { cwd, wsDir } = setupGit()

    writeFileSync(join(cwd, 'file.txt'), 'data', 'utf-8')

    const mgr = new CheckpointManager({ cwd, sessionId: 'test', workspaceDir: wsDir })
    mgr.beginBurst()
    writeFileSync(join(cwd, 'file.txt'), 'changed', 'utf-8')
    const checkpoint = mgr.endBurst()

    expect(checkpoint).not.toBeNull()
    expect(checkpoint!.shadowGit).not.toBeNull()
    expect(checkpoint!.strategy).toBe('shadow_git')
  })
})
