// ---------------------------------------------------------------------------
// SessionStore -- workspace-aware session persistence
// ---------------------------------------------------------------------------
//
// Layout:
//   ~/.codelord/workspaces/<slug>/
//     meta.json               -- WorkspaceMeta
//     sessions/
//       {sessionId}/
//         meta.json            -- lightweight SessionMeta (for listing/finding)
//         snapshot.json        -- full SessionSnapshot
//         timeline.json        -- TimelineSnapshot (for UI hydration)
// ---------------------------------------------------------------------------

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { SessionSnapshot, SessionMeta } from '@codelord/core'
import { toSessionMeta } from '@codelord/core'
import { resolveCodelordHome, sessionsDir as sessionsDirOf, type WorkspaceMeta } from '@codelord/config'
import type { TimelineSnapshot } from './renderer/ink/timeline-projection.js'

// ---------------------------------------------------------------------------
// SessionStore
// ---------------------------------------------------------------------------

export interface SessionStoreOptions {
  /** Absolute path to `~/.codelord/workspaces/<slug>/`. Required. */
  workspaceDir: string
}

export class SessionStore {
  private readonly workspaceDir: string
  private readonly baseDir: string

  constructor(opts: SessionStoreOptions) {
    this.workspaceDir = opts.workspaceDir
    this.baseDir = sessionsDirOf(opts.workspaceDir)
  }

  /** Generate a new session ID */
  newSessionId(): string {
    return randomUUID()
  }

  // --- Write ---

  /** Save a full snapshot + timeline to disk */
  save(snapshot: SessionSnapshot, timeline?: TimelineSnapshot): void {
    mkdirSync(this.baseDir, { recursive: true })
    this.touchWorkspaceMeta(snapshot.cwd)

    const dir = join(this.baseDir, snapshot.sessionId)
    mkdirSync(dir, { recursive: true })

    // Write meta (lightweight index)
    const meta = toSessionMeta(snapshot)
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8')

    // Write full snapshot
    writeFileSync(join(dir, 'snapshot.json'), JSON.stringify(snapshot), 'utf-8')

    // Write timeline if provided
    if (timeline) {
      writeFileSync(join(dir, 'timeline.json'), JSON.stringify(timeline), 'utf-8')
    }
  }

  // --- Read ---

  /** Load a full snapshot by session ID */
  loadSnapshot(sessionId: string): SessionSnapshot | null {
    const file = join(this.baseDir, sessionId, 'snapshot.json')
    if (!existsSync(file)) return null
    try {
      return JSON.parse(readFileSync(file, 'utf-8')) as SessionSnapshot
    } catch {
      return null
    }
  }

  /** Load timeline snapshot by session ID */
  loadTimeline(sessionId: string): TimelineSnapshot | null {
    const file = join(this.baseDir, sessionId, 'timeline.json')
    if (!existsSync(file)) return null
    try {
      return JSON.parse(readFileSync(file, 'utf-8')) as TimelineSnapshot
    } catch {
      return null
    }
  }

  /** Load meta by session ID */
  loadMeta(sessionId: string): SessionMeta | null {
    const file = join(this.baseDir, sessionId, 'meta.json')
    if (!existsSync(file)) return null
    try {
      return JSON.parse(readFileSync(file, 'utf-8')) as SessionMeta
    } catch {
      return null
    }
  }

  // --- Find ---

  /**
   * Find the most recent resumable session for a given cwd.
   * A session is resumable if:
   * - Its cwd matches
   * - It has messages (not an empty session)
   */
  findResumable(cwd: string): SessionMeta | null {
    if (!existsSync(this.baseDir)) return null

    let best: SessionMeta | null = null

    try {
      const entries = readdirSync(this.baseDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const meta = this.loadMeta(entry.name)
        if (!meta) continue
        if (meta.cwd !== cwd) continue
        if (meta.messageCount === 0) continue
        if (!best || meta.updatedAt > best.updatedAt) {
          best = meta
        }
      }
    } catch {
      return null
    }

    return best
  }

  /**
   * Find the most recent session with messages within this workspace.
   * Used by `--resume latest`.
   */
  findLatest(): SessionMeta | null {
    if (!existsSync(this.baseDir)) return null

    let best: SessionMeta | null = null

    try {
      const entries = readdirSync(this.baseDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const meta = this.loadMeta(entry.name)
        if (!meta) continue
        if (meta.messageCount === 0) continue
        if (!best || meta.updatedAt > best.updatedAt) {
          best = meta
        }
      }
    } catch {
      return null
    }

    return best
  }

  /** List all session metas within this workspace, sorted by updatedAt descending */
  listAll(): SessionMeta[] {
    if (!existsSync(this.baseDir)) return []

    const metas: SessionMeta[] = []
    try {
      const entries = readdirSync(this.baseDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const meta = this.loadMeta(entry.name)
        if (meta) metas.push(meta)
      }
    } catch {
      return []
    }

    return metas.toSorted((a, b) => b.updatedAt - a.updatedAt)
  }

  /** Delete a session by ID */
  delete(sessionId: string): void {
    const dir = join(this.baseDir, sessionId)
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  // --- Internal ---

  private touchWorkspaceMeta(cwd: string): void {
    const metaPath = join(this.workspaceDir, 'meta.json')
    mkdirSync(this.workspaceDir, { recursive: true })
    let existing: WorkspaceMeta | null = null
    try {
      existing = JSON.parse(readFileSync(metaPath, 'utf-8')) as WorkspaceMeta
    } catch {
      /* not exist */
    }
    const now = Date.now()
    const next: WorkspaceMeta = existing ? { ...existing, lastUsedAt: now } : { cwd, createdAt: now, lastUsedAt: now }
    writeFileSync(metaPath, JSON.stringify(next, null, 2), 'utf-8')
  }
}

// ---------------------------------------------------------------------------
// Cross-workspace helpers (for CLI commands)
// ---------------------------------------------------------------------------

/** List all sessions across all workspaces. */
export function listAllSessions(codelordHome?: string): SessionMeta[] {
  const home = codelordHome ?? resolveCodelordHome()
  const workspacesRoot = join(home, 'workspaces')
  if (!existsSync(workspacesRoot)) return []

  const metas: SessionMeta[] = []
  try {
    const wsDirs = readdirSync(workspacesRoot, { withFileTypes: true })
    for (const ws of wsDirs) {
      if (!ws.isDirectory()) continue
      const sessionsPath = join(workspacesRoot, ws.name, 'sessions')
      if (!existsSync(sessionsPath)) continue
      try {
        const entries = readdirSync(sessionsPath, { withFileTypes: true })
        for (const entry of entries) {
          if (!entry.isDirectory()) continue
          const metaFile = join(sessionsPath, entry.name, 'meta.json')
          try {
            const meta = JSON.parse(readFileSync(metaFile, 'utf-8')) as SessionMeta
            metas.push(meta)
          } catch {
            /* skip */
          }
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    /* best effort */
  }

  return metas.toSorted((a, b) => b.updatedAt - a.updatedAt)
}

/** Find a session by ID across all workspaces. */
export function findSessionById(
  sessionId: string,
  codelordHome?: string,
): { meta: SessionMeta; workspaceDir: string } | null {
  const home = codelordHome ?? resolveCodelordHome()
  const workspacesRoot = join(home, 'workspaces')
  if (!existsSync(workspacesRoot)) return null

  try {
    const wsDirs = readdirSync(workspacesRoot, { withFileTypes: true })
    for (const ws of wsDirs) {
      if (!ws.isDirectory()) continue
      const sessionsPath = join(workspacesRoot, ws.name, 'sessions')
      const metaFile = join(sessionsPath, sessionId, 'meta.json')
      if (!existsSync(metaFile)) continue
      try {
        const meta = JSON.parse(readFileSync(metaFile, 'utf-8')) as SessionMeta
        return { meta, workspaceDir: join(workspacesRoot, ws.name) }
      } catch {
        /* skip */
      }
    }
  } catch {
    /* best effort */
  }

  return null
}

/** Find the most recent session across all workspaces. */
export function findLatestSession(codelordHome?: string): SessionMeta | null {
  const all = listAllSessions(codelordHome)
  return all.find((m) => m.messageCount > 0) ?? null
}
