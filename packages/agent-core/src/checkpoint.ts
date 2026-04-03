// ---------------------------------------------------------------------------
// Checkpoint — file-scoped snapshot for undo support
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// FileSnapshot — state of a single file before mutation
// ---------------------------------------------------------------------------

export interface FileSnapshot {
  /** Absolute path */
  path: string
  /** Whether the file existed before mutation */
  existed: boolean
  /** Original content (null if file did not exist) */
  originalContent: string | null
}

// ---------------------------------------------------------------------------
// CheckpointRecord — one undo unit (one mutating burst)
// ---------------------------------------------------------------------------

export interface CheckpointRecord {
  checkpointId: string
  sessionId: string
  createdAt: number
  /** Which burst created this checkpoint */
  burstIndex: number
  strategy: 'file_snapshot'
  /** Files protected by this checkpoint */
  files: FileSnapshot[]
  /** Human-readable summary */
  summary: string
  /** Whether this checkpoint can be reliably undone */
  canUndo: boolean
  /** Known limitations of this checkpoint */
  limitations: string[]
}
