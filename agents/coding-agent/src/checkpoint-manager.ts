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
import type { ToolHandler } from '@agent/core'
import type { CheckpointRecord, FileSnapshot } from '@agent/core'

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
  }

  /** Call at the end of each runtime burst — finalizes the checkpoint if one was created */
  endBurst(): void {
    if (this._currentBurst && this._currentBurst.files.length > 0) {
      this._stack.push(this._currentBurst)
    }
    this._currentBurst = null
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
  undo(): { record: CheckpointRecord; restoredFiles: string[] } | null {
    const record = this._stack.pop()
    if (!record) return null

    if (!record.canUndo) {
      // Push it back — can't undo
      this._stack.push(record)
      return null
    }

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

    return { record, restoredFiles }
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
}
