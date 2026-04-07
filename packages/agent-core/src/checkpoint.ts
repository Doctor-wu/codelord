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
// GitCheckpoint — git-level checkpoint info
// ---------------------------------------------------------------------------

export interface GitCheckpoint {
  /** HEAD commit hash at checkpoint time */
  headCommit: string
  /** Whether there were uncommitted changes */
  hadUncommittedChanges: boolean
  /** Stash ref if changes were stashed (e.g. "stash@{0}") */
  stashRef: string | null
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
  strategy: 'file_snapshot' | 'git_stash' | 'hybrid'
  /** Files protected by this checkpoint */
  files: FileSnapshot[]
  /** Git-level checkpoint info (null if not in git repo or git unavailable) */
  git: GitCheckpoint | null
  /** Human-readable summary */
  summary: string
  /** Whether this checkpoint can be reliably undone */
  canUndo: boolean
  /** Known limitations of this checkpoint */
  limitations: string[]
}
