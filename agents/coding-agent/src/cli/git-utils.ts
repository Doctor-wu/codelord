import { execSync } from 'node:child_process'

/** Get current git branch name, or null if not in a git repo */
export function getGitBranch(cwd: string): string | null {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf-8', timeout: 3000 }).trim() || null
  } catch {
    return null
  }
}
