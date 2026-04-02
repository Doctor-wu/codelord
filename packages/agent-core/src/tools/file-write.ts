import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Type } from '@mariozechner/pi-ai'
import type { Tool } from '@mariozechner/pi-ai'
import type { ToolHandler } from '../react-loop.js'

// ---------------------------------------------------------------------------
// file_write — tool definition
// ---------------------------------------------------------------------------

export const fileWriteTool: Tool = {
  name: 'file_write',
  description: [
    'Write content to a file, creating it if it does not exist or overwriting if it does.',
    'This is a full-file write, not a partial edit. Use file_edit for targeted changes.',
    'Set create_directories to true to auto-create parent directories.',
  ].join(' '),
  parameters: Type.Object({
    file_path: Type.String({ description: 'Absolute or relative path to the file.' }),
    content: Type.String({ description: 'The full content to write to the file.' }),
    create_directories: Type.Optional(
      Type.Boolean({ description: 'Create parent directories if they do not exist. Defaults to false.' }),
    ),
  }),
}

// ---------------------------------------------------------------------------
// file_write — handler factory
// ---------------------------------------------------------------------------

export interface FileWriteOptions {
  cwd?: string
}

export function createFileWriteHandler(options: FileWriteOptions = {}): ToolHandler {
  const { cwd = process.cwd() } = options

  return async (args) => {
    const filePath = args.file_path as string | undefined
    if (!filePath || typeof filePath !== 'string') {
      return 'ERROR [INVALID_ARGS]: file_path is required and must be a string.'
    }
    if (typeof args.content !== 'string') {
      return 'ERROR [INVALID_ARGS]: content is required and must be a string.'
    }

    const resolved = resolvePath(cwd, filePath)
    const content = args.content as string
    const createDirs = args.create_directories === true

    try {
      if (createDirs) {
        await mkdir(dirname(resolved), { recursive: true })
      }
      await writeFile(resolved, content, 'utf-8')
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        return `ERROR [NOT_FOUND]: Parent directory does not exist: ${dirname(resolved)}. Set create_directories to true to auto-create.`
      }
      if (isNodeError(err) && err.code === 'EACCES') {
        return `ERROR [PERMISSION_DENIED]: Permission denied: ${resolved}`
      }
      return `ERROR: Failed to write file: ${err instanceof Error ? err.message : String(err)}`
    }

    const lineCount = content.split('\n').length
    return `OK: Wrote ${lineCount} lines to ${resolved}`
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
