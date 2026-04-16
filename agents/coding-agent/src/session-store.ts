// ---------------------------------------------------------------------------
// SessionStore — local filesystem persistence for session snapshots
// ---------------------------------------------------------------------------
//
// Layout:
//   ~/.codelord/sessions/
//     {sessionId}/
//       meta.json        — lightweight SessionMeta (for listing/finding)
//       snapshot.json     — full SessionSnapshot
//       timeline.json     — TimelineSnapshot (for UI hydration)
// ---------------------------------------------------------------------------

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { SessionSnapshot, SessionMeta } from '@codelord/core'
import { toSessionMeta } from '@codelord/core'
import type { TimelineSnapshot } from './renderer/ink/timeline-projection.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSIONS_DIR = join(homedir(), '.codelord', 'sessions')

// ---------------------------------------------------------------------------
// SessionStore
// ---------------------------------------------------------------------------

export class SessionStore {
  private readonly baseDir: string

  constructor(baseDir = SESSIONS_DIR) {
    this.baseDir = baseDir
  }

  /** Generate a new session ID */
  newSessionId(): string {
    return randomUUID()
  }

  // --- Write ---

  /** Save a full snapshot + timeline to disk */
  save(snapshot: SessionSnapshot, timeline?: TimelineSnapshot): void {
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
   * - Its runtimeState is READY, BLOCKED, or was in-flight (will be downgraded)
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
   * Find the most recent session with messages, regardless of cwd.
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

  /** List all session metas, sorted by updatedAt descending */
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
}
