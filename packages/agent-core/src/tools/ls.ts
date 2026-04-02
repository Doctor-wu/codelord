import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Type } from '@mariozechner/pi-ai'
import type { Tool } from '@mariozechner/pi-ai'
import type { ToolHandler } from '../react-loop.js'

// ---------------------------------------------------------------------------
// ls — tool definition
// ---------------------------------------------------------------------------

export const lsTool: Tool = {
  name: 'ls',
  description: [
    'List directory contents to explore project structure.',
    'Use this to understand what files and directories exist at a path.',
    'Supports optional recursion, glob filtering, and type filtering.',
  ].join(' '),
  parameters: Type.Object({
    path: Type.Optional(
      Type.String({ description: 'Directory path to list. Defaults to cwd.' }),
    ),
    recursive: Type.Optional(
      Type.Boolean({ description: 'Recursively list subdirectories. Defaults to false.' }),
    ),
    glob: Type.Optional(
      Type.String({ description: 'Glob pattern to filter entries (e.g. "*.ts"). Simple suffix matching only.' }),
    ),
    type: Type.Optional(
      Type.String({ description: 'Filter by type: "file" or "dir". Defaults to both.' }),
    ),
    max_entries: Type.Optional(
      Type.Number({ description: 'Maximum entries to return. Defaults to 200.' }),
    ),
  }),
}

// ---------------------------------------------------------------------------
// ls — handler factory
// ---------------------------------------------------------------------------

export interface LsOptions {
  cwd?: string
}

const DEFAULT_MAX_ENTRIES = 200

export function createLsHandler(options: LsOptions = {}): ToolHandler {
  const { cwd = process.cwd() } = options

  return async (args) => {
    const dirPath = typeof args.path === 'string' ? resolvePath(cwd, args.path) : cwd
    const recursive = args.recursive === true
    const glob = typeof args.glob === 'string' ? args.glob : undefined
    const typeFilter = typeof args.type === 'string' ? args.type : undefined
    const maxEntries = Math.max(1, Number(args.max_entries) || DEFAULT_MAX_ENTRIES)

    if (typeFilter && typeFilter !== 'file' && typeFilter !== 'dir') {
      return { output: 'ERROR [INVALID_ARGS]: type must be "file" or "dir".', isError: true, errorCode: 'INVALID_ARGS' }
    }

    const entries: string[] = []
    let truncated = false

    try {
      await collectEntries(dirPath, dirPath, recursive, glob, typeFilter as 'file' | 'dir' | undefined, entries, maxEntries)
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        return { output: `ERROR [NOT_FOUND]: Directory not found: ${dirPath}`, isError: true, errorCode: 'NOT_FOUND' }
      }
      if (isNodeError(err) && err.code === 'EACCES') {
        return { output: `ERROR [PERMISSION_DENIED]: Permission denied: ${dirPath}`, isError: true, errorCode: 'PERMISSION_DENIED' }
      }
      if (isNodeError(err) && err.code === 'ENOTDIR') {
        return { output: `ERROR [INVALID_ARGS]: Path is not a directory: ${dirPath}`, isError: true, errorCode: 'INVALID_ARGS' }
      }
      return { output: `ERROR: Failed to list directory: ${err instanceof Error ? err.message : String(err)}`, isError: true }
    }

    if (entries.length >= maxEntries) {
      truncated = true
    }

    if (entries.length === 0) {
      return { output: `${dirPath}: (empty)`, isError: false }
    }

    let result = entries.join('\n')
    if (truncated) {
      result += `\n[truncated at ${maxEntries} entries]`
    }
    return { output: result, isError: false }
  }
}

// ---------------------------------------------------------------------------
// Recursive directory walker
// ---------------------------------------------------------------------------

async function collectEntries(
  basePath: string,
  currentPath: string,
  recursive: boolean,
  glob: string | undefined,
  typeFilter: 'file' | 'dir' | undefined,
  entries: string[],
  maxEntries: number,
): Promise<void> {
  if (entries.length >= maxEntries) return

  const dirEntries = await readdir(currentPath, { withFileTypes: true })

  // Sort for stable output
  dirEntries.sort((a, b) => a.name.localeCompare(b.name))

  for (const entry of dirEntries) {
    if (entries.length >= maxEntries) return

    const fullPath = join(currentPath, entry.name)
    const relativePath = fullPath.slice(basePath.length + 1)
    const isDir = entry.isDirectory()

    // Type filter
    if (typeFilter === 'file' && isDir) {
      // Still recurse into dirs even if filtering for files
      if (recursive) {
        await collectEntries(basePath, fullPath, recursive, glob, typeFilter, entries, maxEntries)
      }
      continue
    }
    if (typeFilter === 'dir' && !isDir) continue

    // Glob filter (simple suffix matching)
    if (glob && !matchGlob(entry.name, glob)) {
      if (isDir && recursive) {
        await collectEntries(basePath, fullPath, recursive, glob, typeFilter, entries, maxEntries)
      }
      continue
    }

    const suffix = isDir ? '/' : ''
    entries.push(relativePath + suffix)

    if (isDir && recursive) {
      await collectEntries(basePath, fullPath, recursive, glob, typeFilter, entries, maxEntries)
    }
  }
}

// ---------------------------------------------------------------------------
// Simple glob matching (suffix-based)
// ---------------------------------------------------------------------------

function matchGlob(name: string, pattern: string): boolean {
  // Handle *.ext patterns
  if (pattern.startsWith('*.')) {
    return name.endsWith(pattern.slice(1))
  }
  // Handle exact match
  if (pattern === name) return true
  // Handle simple wildcard at start
  if (pattern.startsWith('*')) {
    return name.endsWith(pattern.slice(1))
  }
  // Handle simple wildcard at end
  if (pattern.endsWith('*')) {
    return name.startsWith(pattern.slice(0, -1))
  }
  return name === pattern
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolvePath(cwd: string, filePath: string): string {
  if (filePath.startsWith('/')) return filePath
  return `${cwd}/${filePath}`
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err
}
