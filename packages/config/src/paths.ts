import { homedir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

/**
 * Root directory for all codelord state.
 * Defaults to `~/.codelord/`. Can be overridden via `CODELORD_HOME` env var
 * (primarily for tests and sandboxed environments).
 */
export function resolveCodelordHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.CODELORD_HOME ?? join(homedir(), '.codelord')
}

/**
 * Canonical workspace slug -- flatten absolute path into a directory name.
 * `/Users/foo/my-project` → `Users-foo-my-project`
 *
 * Deterministic, unique (1-to-1 with the original path modulo edge cases
 * where path components contain `-`), and human-readable.
 * The exact cwd is also stored in `meta.json` for reliable reverse lookup.
 */
export function workspaceSlug(cwd: string): string {
  return cwd.replace(/^\//, '').replaceAll('/', '-') || 'root'
}

/** Short hash id for a workspace (8-char sha256 prefix). */
export function workspaceId(cwd: string): string {
  return createHash('sha256').update(cwd).digest('hex').slice(0, 8)
}

/** Absolute path to `~/.codelord/workspaces/<slug>/` for a given cwd. */
export function workspaceDir(codelordHome: string, cwd: string): string {
  return join(codelordHome, 'workspaces', workspaceSlug(cwd))
}

/** Sub-paths within a workspace. */
export function sessionsDir(wsDir: string): string {
  return join(wsDir, 'sessions')
}
export function tracesDir(wsDir: string): string {
  return join(wsDir, 'traces')
}
export function shadowGitDir(wsDir: string): string {
  return join(wsDir, 'shadow-git')
}

/** Workspace-level metadata stored at `<workspaceDir>/meta.json`. */
export interface WorkspaceMeta {
  cwd: string
  createdAt: number
  lastUsedAt: number
}

/**
 * Ensure workspace meta.json exists and update `lastUsedAt`.
 * Should be called by any code path that writes into a workspace directory
 * (session save, trace save, checkpoint creation) so that the cwd→slug
 * mapping is always discoverable from disk.
 */
export function touchWorkspaceMeta(wsDir: string, cwd: string): void {
  const metaPath = join(wsDir, 'meta.json')
  mkdirSync(wsDir, { recursive: true })
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
