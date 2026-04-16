import { homedir } from 'node:os'
import { join, basename } from 'node:path'
import { createHash } from 'node:crypto'

/**
 * Root directory for all codelord state.
 * Defaults to `~/.codelord/`. Can be overridden via `CODELORD_HOME` env var
 * (primarily for tests and sandboxed environments).
 */
export function resolveCodelordHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.CODELORD_HOME ?? join(homedir(), '.codelord')
}

/**
 * Canonical workspace slug -- deterministic, short, readable.
 * Format: `{basename}-{sha256(cwd).slice(0, 8)}`.
 * basename is sanitized to `[a-zA-Z0-9._-]` and truncated to 40 chars.
 */
export function workspaceSlug(cwd: string): string {
  const name =
    basename(cwd)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 40) || 'root'
  const hash = createHash('sha256').update(cwd).digest('hex').slice(0, 8)
  return `${name}-${hash}`
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
