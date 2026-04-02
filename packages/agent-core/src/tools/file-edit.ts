import { readFile, writeFile } from 'node:fs/promises'
import { Type } from '@mariozechner/pi-ai'
import type { Tool } from '@mariozechner/pi-ai'
import type { ToolHandler } from '../react-loop.js'

// ---------------------------------------------------------------------------
// file_edit — tool definition
// ---------------------------------------------------------------------------

export const fileEditTool: Tool = {
  name: 'file_edit',
  description: [
    'Perform a precise search-and-replace edit in a file.',
    'old_string must match exactly one location in the file.',
    'Fails if old_string matches zero times (NO_MATCH) or more than once (MULTI_MATCH).',
    'This is deterministic — no fuzzy matching, no auto-expansion.',
  ].join(' '),
  parameters: Type.Object({
    file_path: Type.String({ description: 'Absolute or relative path to the file.' }),
    old_string: Type.String({ description: 'The exact string to find. Must match exactly once.' }),
    new_string: Type.String({ description: 'The replacement string.' }),
  }),
}

// ---------------------------------------------------------------------------
// file_edit — handler factory
// ---------------------------------------------------------------------------

export interface FileEditOptions {
  cwd?: string
}

export function createFileEditHandler(options: FileEditOptions = {}): ToolHandler {
  const { cwd = process.cwd() } = options

  return async (args) => {
    const filePath = args.file_path as string | undefined
    if (!filePath || typeof filePath !== 'string') {
      return 'ERROR [INVALID_ARGS]: file_path is required and must be a string.'
    }
    if (typeof args.old_string !== 'string') {
      return 'ERROR [INVALID_ARGS]: old_string is required and must be a string.'
    }
    if (typeof args.new_string !== 'string') {
      return 'ERROR [INVALID_ARGS]: new_string is required and must be a string.'
    }

    const resolved = resolvePath(cwd, filePath)
    const oldString = args.old_string as string
    const newString = args.new_string as string

    let content: string
    try {
      content = await readFile(resolved, 'utf-8')
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        return `ERROR [NOT_FOUND]: File not found: ${resolved}`
      }
      if (isNodeError(err) && err.code === 'EACCES') {
        return `ERROR [PERMISSION_DENIED]: Permission denied: ${resolved}`
      }
      return `ERROR: Failed to read file: ${err instanceof Error ? err.message : String(err)}`
    }

    // Count exact occurrences
    const matchCount = countOccurrences(content, oldString)

    if (matchCount === 0) {
      return `ERROR [NO_MATCH]: old_string not found in ${resolved}. No changes made.`
    }
    if (matchCount > 1) {
      return `ERROR [MULTI_MATCH]: old_string found ${matchCount} times in ${resolved}. Provide more context to match exactly once. No changes made.`
    }

    // Exactly one match — perform replacement
    const updated = content.replace(oldString, newString)

    try {
      await writeFile(resolved, updated, 'utf-8')
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'EACCES') {
        return `ERROR [PERMISSION_DENIED]: Permission denied writing to: ${resolved}`
      }
      return `ERROR: Failed to write file: ${err instanceof Error ? err.message : String(err)}`
    }

    return `OK: Replaced 1 occurrence in ${resolved}`
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countOccurrences(haystack: string, needle: string): number {
  let count = 0
  let pos = 0
  while (true) {
    const idx = haystack.indexOf(needle, pos)
    if (idx === -1) break
    count++
    pos = idx + 1
  }
  return count
}

function resolvePath(cwd: string, filePath: string): string {
  if (filePath.startsWith('/')) return filePath
  return `${cwd}/${filePath}`
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err
}
