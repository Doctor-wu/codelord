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
// ShadowGitCheckpoint — shadow git repo checkpoint info
// ---------------------------------------------------------------------------

export interface ShadowGitCheckpoint {
  /** Absolute path to the shadow .git directory */
  shadowGitDir: string
  /** Commit hash in shadow repo representing pre-burst state */
  commitHash: string
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
  strategy: 'file_snapshot' | 'shadow_git' | 'hybrid'
  /** Files protected by this checkpoint */
  files: FileSnapshot[]
  /** Shadow git checkpoint info (null if shadow repo unavailable) */
  shadowGit: ShadowGitCheckpoint | null
  /** Human-readable summary */
  summary: string
  /** Whether this checkpoint can be reliably undone */
  canUndo: boolean
  /** Known limitations of this checkpoint */
  limitations: string[]
}
