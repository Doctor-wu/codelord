import { readFile } from 'node:fs/promises'
import { Type } from '@mariozechner/pi-ai'
import type { Tool } from '@mariozechner/pi-ai'
import type { ToolHandler } from '../react-loop.js'

// ---------------------------------------------------------------------------
// file_read — tool definition
// ---------------------------------------------------------------------------

export const fileReadTool: Tool = {
  name: 'file_read',
  description: [
    'Read the contents of a file at a known path.',
    'Use this instead of bash cat/head/tail when you already know the file path.',
    'Supports optional line range to avoid loading entire large files.',
  ].join(' '),
  parameters: Type.Object({
    file_path: Type.String({ description: 'Absolute or relative path to the file.' }),
    offset: Type.Optional(
      Type.Number({ description: '1-based line number to start reading from. Defaults to 1.' }),
    ),
    limit: Type.Optional(
      Type.Number({ description: 'Maximum number of lines to read. Defaults to no limit.' }),
    ),
  }),
}

// ---------------------------------------------------------------------------
// file_read — handler factory
// ---------------------------------------------------------------------------

export interface FileReadOptions {
  cwd?: string
}

export function createFileReadHandler(options: FileReadOptions = {}): ToolHandler {
  const { cwd = process.cwd() } = options

  return async (args) => {
    const filePath = args.file_path as string | undefined
    if (!filePath || typeof filePath !== 'string') {
      return 'ERROR [INVALID_ARGS]: file_path is required and must be a string.'
    }

    const resolved = resolvePath(cwd, filePath)

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
      if (isNodeError(err) && err.code === 'EISDIR') {
        return `ERROR [INVALID_ARGS]: Path is a directory, not a file: ${resolved}`
      }
      return `ERROR: Failed to read file: ${err instanceof Error ? err.message : String(err)}`
    }

    const lines = content.split('\n')
    const offset = Math.max(1, Number(args.offset) || 1)
    const limit = args.limit != null ? Math.max(1, Number(args.limit)) : undefined

    const startIdx = offset - 1
    const sliced = limit != null ? lines.slice(startIdx, startIdx + limit) : lines.slice(startIdx)

    const numbered = sliced.map((line, i) => `${offset + i}\t${line}`).join('\n')
    const totalLines = lines.length
    const shownFrom = offset
    const shownTo = offset + sliced.length - 1

    let header = `${resolved} (${totalLines} lines total`
    if (startIdx > 0 || limit != null) {
      header += `, showing lines ${shownFrom}-${shownTo}`
    }
    header += ')'

    return `${header}\n${numbered}`
  }
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
