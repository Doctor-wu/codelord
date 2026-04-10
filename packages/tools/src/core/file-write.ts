import { writeFile, mkdir } from 'node:fs/promises'
import { resolve, isAbsolute, dirname } from 'node:path'
import { Type } from '@codelord/core'
import type { Tool } from '@codelord/core'
import type { ToolPlugin, ToolPluginContext } from '@codelord/core'
import type { ToolHandler, ToolExecutionResult } from '@codelord/core'
import type { ToolContract } from '@codelord/core'

// ---------------------------------------------------------------------------
// file_write — tool definition
// ---------------------------------------------------------------------------

const tool: Tool = {
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
    reason: Type.Optional(
      Type.String({ description: 'Brief explanation of why you are calling this tool for this specific step.' }),
    ),
  }),
}

// ---------------------------------------------------------------------------
// file_write — handler factory
// ---------------------------------------------------------------------------

function createFileWriteHandler(cwd: string): ToolHandler {
  return async (args) => {
    const filePath = args.file_path as string | undefined
    if (!filePath || typeof filePath !== 'string') {
      return { output: 'ERROR [INVALID_ARGS]: file_path is required and must be a string.', isError: true, errorCode: 'INVALID_ARGS' }
    }
    if (typeof args.content !== 'string') {
      return { output: 'ERROR [INVALID_ARGS]: content is required and must be a string.', isError: true, errorCode: 'INVALID_ARGS' }
    }

    const resolved = isAbsolute(filePath) ? resolve(filePath) : resolve(cwd, filePath)
    const content = args.content as string
    const createDirs = args.create_directories === true

    try {
      if (createDirs) {
        await mkdir(dirname(resolved), { recursive: true })
      }
      await writeFile(resolved, content, 'utf-8')
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        return { output: `ERROR [NOT_FOUND]: Parent directory does not exist: ${dirname(resolved)}. Set create_directories to true to auto-create.`, isError: true, errorCode: 'NOT_FOUND' }
      }
      if (isNodeError(err) && err.code === 'EACCES') {
        return { output: `ERROR [PERMISSION_DENIED]: Permission denied: ${resolved}`, isError: true, errorCode: 'PERMISSION_DENIED' }
      }
      return { output: `ERROR: Failed to write file: ${err instanceof Error ? err.message : String(err)}`, isError: true }
    }

    const lineCount = content.split('\n').length
    return { output: `OK: Wrote ${lineCount} lines to ${resolved}`, isError: false }
  }
}

// ---------------------------------------------------------------------------
// file_write — contract
// ---------------------------------------------------------------------------

const contract: ToolContract = {
  toolName: 'file_write',
  whenToUse: [
    'Creating a new file.',
    'Overwriting an entire file with known complete content.',
  ],
  whenNotToUse: [
    'Do not use for partial edits — use file_edit instead.',
    'Do not use if you only need to change a few lines in an existing file.',
  ],
  preconditions: [
    'You must have the complete file content ready.',
    'Parent directory must exist, or set create_directories=true.',
  ],
  failureSemantics: [
    'NOT_FOUND: parent directory does not exist (and create_directories is false).',
    'PERMISSION_DENIED: insufficient permissions.',
  ],
  fallbackHints: [
    'On NOT_FOUND, retry with create_directories=true.',
    'If only changing part of a file, switch to file_edit.',
  ],
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const fileWritePlugin: ToolPlugin = {
  id: 'file_write',
  tool,
  createHandler: (ctx) => createFileWriteHandler(ctx.cwd),
  contract,
  riskLevel: 'write',
  category: 'core',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err
}
