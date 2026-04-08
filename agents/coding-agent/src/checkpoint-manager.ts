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
import type { CheckpointRecord, FileSnapshot, ShadowGitCheckpoint } from '@agent/core'

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
  private _shadowCheckpoint: ShadowGitCheckpoint | null = null
  private _shadowReady = false

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
    this._shadowCheckpoint = this.createShadowCheckpoint()
  }

  /** Call at the end of each runtime burst — finalizes the checkpoint if one was created. Returns the record if created. */
  endBurst(): CheckpointRecord | null {
    const hasFiles = this._currentBurst && this._currentBurst.files.length > 0

    // Check if working tree actually changed since the shadow checkpoint
    let hasShadowDirty = false
    if (this._shadowCheckpoint) {
      try {
        const status = this.shadowGit('status --porcelain')
        hasShadowDirty = status.length > 0
      } catch { /* shadow repo unavailable — treat as no change */ }
    }

    if (hasFiles || hasShadowDirty) {
      // Ensure a burst record exists
      if (!this._currentBurst) {
        this._currentBurst = {
          checkpointId: randomUUID(),
          sessionId: this.sessionId,
          createdAt: Date.now(),
          burstIndex: this._burstCounter,
          strategy: 'shadow_git',
          files: [],
          shadowGit: this._shadowCheckpoint,
          summary: '',
          canUndo: true,
          limitations: [],
        }
      } else {
        this._currentBurst.shadowGit = this._shadowCheckpoint
      }

      // Determine strategy
      if (hasFiles && hasShadowDirty) {
        this._currentBurst.strategy = 'hybrid'
      } else if (hasShadowDirty) {
        this._currentBurst.strategy = 'shadow_git'
      }
      // else stays 'file_snapshot'

      this._currentBurst.summary = this.buildSummary(this._currentBurst)
      this._stack.push(this._currentBurst)
      const created = this._currentBurst
      this._currentBurst = null
      this._shadowCheckpoint = null
      return created
    }

    this._currentBurst = null
    this._shadowCheckpoint = null
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

    // --- Shadow git restore (best effort) ---
    let gitRestored = false
    if (record.shadowGit) {
      try {
        const gitDir = record.shadowGit.shadowGitDir
        const hash = record.shadowGit.commitHash
        const sg = (args: string) => execSync(
          `git --git-dir="${gitDir}" --work-tree="${this.cwd}" ${args}`,
          { cwd: this.cwd, timeout: 10000, stdio: 'pipe' },
        )
        // Reset working tree to the checkpoint state
        sg(`reset --hard ${hash}`)
        // Remove files that were added after the checkpoint
        sg('clean -fd')
        gitRestored = true
      } catch {
        record.limitations.push('shadow git restore failed — manual recovery may be needed')
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
        shadowGit: null,
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

  /** Get the shadow git-dir path */
  private get shadowGitDir(): string {
    return resolve(this.cwd, '.codelord', 'shadow')
  }

  /** Execute a git command against the shadow repo */
  private shadowGit(args: string, timeout = 5000): string {
    return execSync(
      `git --git-dir="${this.shadowGitDir}" --work-tree="${this.cwd}" ${args}`,
      { cwd: this.cwd, timeout, stdio: 'pipe' },
    ).toString().trim()
  }

  /** Lazy-init the shadow git repo. Returns true if ready. */
  private ensureShadowRepo(): boolean {
    if (this._shadowReady) return true
    try {
      const gitDir = this.shadowGitDir
      mkdirSync(gitDir, { recursive: true })
      // Init if not already a git repo
      try {
        this.shadowGit('rev-parse --git-dir')
      } catch {
        execSync(`git init --bare "${gitDir}"`, { timeout: 5000, stdio: 'pipe' })
        // Exclude .codelord/ from shadow repo tracking
        const excludeDir = resolve(gitDir, 'info')
        mkdirSync(excludeDir, { recursive: true })
        writeFileSync(resolve(excludeDir, 'exclude'), '.codelord/\n', 'utf-8')
        // Configure for the shadow repo
        this.shadowGit('config user.email "codelord-shadow@local"')
        this.shadowGit('config user.name "codelord-shadow"')
        // Initial commit so HEAD exists
        this.shadowGit('commit --allow-empty -m "shadow-init"')
      }
      this._shadowReady = true
      return true
    } catch {
      return false
    }
  }

  /** Snapshot current working tree state into shadow repo */
  private createShadowCheckpoint(): ShadowGitCheckpoint | null {
    if (!this.ensureShadowRepo()) return null
    try {
      // Stage everything including untracked, excluding .codelord/
      this.shadowGit('add -A')

      // Check if there's anything to commit
      const status = this.shadowGit('status --porcelain')
      if (status.length === 0) {
        // Working tree identical to last shadow commit — return current HEAD
        const hash = this.shadowGit('rev-parse HEAD')
        return { shadowGitDir: this.shadowGitDir, commitHash: hash }
      }

      const msg = `checkpoint-${this._burstCounter}`
      this.shadowGit(`commit -m "${msg}"`)
      const hash = this.shadowGit('rev-parse HEAD')
      return { shadowGitDir: this.shadowGitDir, commitHash: hash }
    } catch {
      return null
    }
  }

  private buildSummary(record: CheckpointRecord): string {
    const parts: string[] = []
    if (record.files.length > 0) {
      parts.push(`${record.files.length} file(s) protected`)
    }
    if (record.shadowGit) {
      parts.push(`shadow git: ${record.shadowGit.commitHash.slice(0, 7)}`)
    }
    return parts.join(', ') || 'empty checkpoint'
  }
}
