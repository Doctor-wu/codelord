// ---------------------------------------------------------------------------
// CheckpointManager — lazy file-scoped checkpoint for undo support
// ---------------------------------------------------------------------------
//
// The manager wraps mutating tool handlers (file_write, file_edit) so that
// the first mutation in a burst lazily creates a checkpoint. Subsequent
// mutations in the same burst append to the same checkpoint.
//
// /undo restores files from the most recent checkpoint and pops the stack.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs'
import { resolve, isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execSync } from 'node:child_process'
import type { ToolHandler } from '@agent/core'
import type { CheckpointRecord, FileSnapshot, GitCheckpoint } from '@agent/core'

// ---------------------------------------------------------------------------
// Mutating tool names that trigger checkpoint creation
// ---------------------------------------------------------------------------

const MUTATING_TOOLS = new Set(['file_write', 'file_edit'])

// ---------------------------------------------------------------------------
// CheckpointManager
// ---------------------------------------------------------------------------

export class CheckpointManager {
  private readonly cwd: string
  private readonly sessionId: string
  private _stack: CheckpointRecord[] = []
  private _currentBurst: CheckpointRecord | null = null
  private _burstCounter = 0
  private _gitCheckpoint: GitCheckpoint | null = null

  constructor(opts: { cwd: string; sessionId: string; stack?: CheckpointRecord[] }) {
    this.cwd = opts.cwd
    this.sessionId = opts.sessionId
    this._stack = opts.stack ? [...opts.stack] : []
  }

  get stack(): readonly CheckpointRecord[] { return this._stack }

  /** Call at the start of each runtime burst */
  beginBurst(): void {
    this._burstCounter++
    this._currentBurst = null
    this._gitCheckpoint = this.createGitCheckpoint()
  }

  /** Call at the end of each runtime burst — finalizes the checkpoint if one was created. Returns the record if created. */
  endBurst(): CheckpointRecord | null {
    const hasFiles = this._currentBurst && this._currentBurst.files.length > 0
    const hasGitStash = this._gitCheckpoint !== null && this._gitCheckpoint.stashRef !== null

    if (hasFiles || hasGitStash) {
      // Ensure a burst record exists
      if (!this._currentBurst) {
        this._currentBurst = {
          checkpointId: randomUUID(),
          sessionId: this.sessionId,
          createdAt: Date.now(),
          burstIndex: this._burstCounter,
          strategy: 'git_stash',
          files: [],
          git: this._gitCheckpoint,
          summary: '',
          canUndo: true,
          limitations: [],
        }
      } else {
        this._currentBurst.git = this._gitCheckpoint
      }

      // Determine strategy
      if (hasFiles && hasGitStash) {
        this._currentBurst.strategy = 'hybrid'
      } else if (hasGitStash) {
        this._currentBurst.strategy = 'git_stash'
      }
      // else stays 'file_snapshot'

      this._currentBurst.summary = this.buildSummary(this._currentBurst)
      this._stack.push(this._currentBurst)
      const created = this._currentBurst
      this._currentBurst = null
      this._gitCheckpoint = null
      return created
    }

    this._currentBurst = null
    this._gitCheckpoint = null
    return null
  }

  /**
   * Wrap a tool handler map so that mutating tools lazily create checkpoints.
   * Returns a new Map — does not mutate the original.
   */
  wrapHandlers(handlers: Map<string, ToolHandler>): Map<string, ToolHandler> {
    const wrapped = new Map(handlers)
    for (const toolName of MUTATING_TOOLS) {
      const original = handlers.get(toolName)
      if (!original) continue
      wrapped.set(toolName, this.wrapMutatingHandler(toolName, original))
    }
    return wrapped
  }

  /**
   * Undo the most recent checkpoint.
   * Returns the undone checkpoint, or null if nothing to undo.
   */
  undo(): { record: CheckpointRecord; restoredFiles: string[]; gitRestored: boolean } | null {
    const record = this._stack.pop()
    if (!record) return null

    if (!record.canUndo) {
      // Push it back — can't undo
      this._stack.push(record)
      return null
    }

    // --- Git restore (best effort) ---
    let gitRestored = false
    if (record.git?.stashRef) {
      try {
        execSync(`git stash pop ${record.git.stashRef}`, {
          cwd: this.cwd,
          timeout: 5000,
          stdio: 'pipe',
        })
        gitRestored = true
      } catch {
        // Git stash pop failed (conflict, stash already gone, etc.)
        // Record limitation but don't block file-level restore
        record.limitations.push('git stash pop failed — manual recovery may be needed')
      }
    }

    // --- File-level restore ---
    const restoredFiles: string[] = []
    for (const snap of record.files) {
      try {
        if (snap.existed && snap.originalContent !== null) {
          writeFileSync(snap.path, snap.originalContent, 'utf-8')
          restoredFiles.push(snap.path)
        } else if (!snap.existed) {
          if (existsSync(snap.path)) {
            unlinkSync(snap.path)
            restoredFiles.push(snap.path)
          }
        }
      } catch {
        // Best effort — file may have been moved/deleted externally
      }
    }

    return { record, restoredFiles, gitRestored }
  }

  /** Check if there's anything to undo */
  get canUndo(): boolean {
    return this._stack.length > 0 && this._stack[this._stack.length - 1].canUndo
  }

  get undoCount(): number { return this._stack.length }

  // --- Internal ---

  private wrapMutatingHandler(toolName: string, original: ToolHandler): ToolHandler {
    return async (args, context) => {
      const filePath = args.file_path as string | undefined
      if (filePath) {
        this.snapshotFile(filePath, toolName)
      }
      return original(args, context)
    }
  }

  private snapshotFile(filePath: string, toolName: string): void {
    const resolved = isAbsolute(filePath) ? resolve(filePath) : resolve(this.cwd, filePath)

    // Lazy: create checkpoint record on first mutation in this burst
    if (!this._currentBurst) {
      this._currentBurst = {
        checkpointId: randomUUID(),
        sessionId: this.sessionId,
        createdAt: Date.now(),
        burstIndex: this._burstCounter,
        strategy: 'file_snapshot',
        files: [],
        git: null,
        summary: '',
        canUndo: true,
        limitations: [],
      }
    }

    // Don't snapshot the same file twice in one burst
    if (this._currentBurst.files.some(f => f.path === resolved)) return

    let existed = false
    let originalContent: string | null = null
    try {
      originalContent = readFileSync(resolved, 'utf-8')
      existed = true
    } catch {
      // File doesn't exist — that's fine, we record it as non-existent
    }

    this._currentBurst.files.push({ path: resolved, existed, originalContent })
    this._currentBurst.summary = `${this._currentBurst.files.length} file(s) protected`
  }

  /** Create a git-level checkpoint if cwd is inside a git repo */
  private createGitCheckpoint(): GitCheckpoint | null {
    try {
      const isGit = execSync('git rev-parse --is-inside-work-tree', {
        cwd: this.cwd,
        timeout: 3000,
        stdio: 'pipe',
      }).toString().trim()

      if (isGit !== 'true') return null

      const headCommit = execSync('git rev-parse HEAD', {
        cwd: this.cwd,
        timeout: 3000,
        stdio: 'pipe',
      }).toString().trim()

      const status = execSync('git status --porcelain', {
        cwd: this.cwd,
        timeout: 3000,
        stdio: 'pipe',
      }).toString().trim()

      const hadUncommittedChanges = status.length > 0
      let stashRef: string | null = null

      if (hadUncommittedChanges) {
        const stashMsg = `codelord-checkpoint-${this._burstCounter}`
        execSync(`git stash push -m "${stashMsg}" --include-untracked`, {
          cwd: this.cwd,
          timeout: 5000,
          stdio: 'pipe',
        })
        // Verify stash was created by checking stash list
        const stashList = execSync('git stash list --max-count=1', {
          cwd: this.cwd,
          timeout: 3000,
          stdio: 'pipe',
        }).toString().trim()

        if (stashList.includes(stashMsg)) {
          stashRef = 'stash@{0}'
        }
      }

      return { headCommit, hadUncommittedChanges, stashRef }
    } catch {
      // Git not available or not a git repo — skip
      return null
    }
  }

  private buildSummary(record: CheckpointRecord): string {
    const parts: string[] = []
    if (record.files.length > 0) {
      parts.push(`${record.files.length} file(s) protected`)
    }
    if (record.git) {
      parts.push(record.git.stashRef ? 'git stash created' : 'git HEAD recorded')
    }
    return parts.join(', ') || 'empty checkpoint'
  }
}
