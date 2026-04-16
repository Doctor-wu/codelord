import { readFile } from 'node:fs/promises'
import { resolve, isAbsolute } from 'node:path'
import { Type } from '@codelord/core'
import type { Tool } from '@codelord/core'
import type { ToolPlugin } from '@codelord/core'
import type { ToolHandler } from '@codelord/core'
import type { ToolContract } from '@codelord/core'

// ---------------------------------------------------------------------------
// file_read — tool definition
// ---------------------------------------------------------------------------

const tool: Tool = {
  name: 'file_read',
  description: [
    'Read the contents of a file at a known path.',
    'Use this instead of bash cat/head/tail when you already know the file path.',
    'Supports optional line range to avoid loading entire large files.',
  ].join(' '),
  parameters: Type.Object({
    file_path: Type.String({ description: 'Absolute or relative path to the file.' }),
    offset: Type.Optional(Type.Number({ description: '1-based line number to start reading from. Defaults to 1.' })),
    limit: Type.Optional(Type.Number({ description: 'Maximum number of lines to read. Defaults to no limit.' })),
    reason: Type.Optional(
      Type.String({ description: 'Brief explanation of why you are calling this tool for this specific step.' }),
    ),
  }),
}

// ---------------------------------------------------------------------------
// file_read — handler factory
// ---------------------------------------------------------------------------

function createFileReadHandler(cwd: string): ToolHandler {
  return async (args) => {
    const filePath = args.file_path as string | undefined
    if (!filePath || typeof filePath !== 'string') {
      return {
        output: 'ERROR [INVALID_ARGS]: file_path is required and must be a string.',
        isError: true,
        errorCode: 'INVALID_ARGS',
      }
    }

    const resolved = isAbsolute(filePath) ? resolve(filePath) : resolve(cwd, filePath)

    let content: string
    try {
      content = await readFile(resolved, 'utf-8')
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        return { output: `ERROR [NOT_FOUND]: File not found: ${resolved}`, isError: true, errorCode: 'NOT_FOUND' }
      }
      if (isNodeError(err) && err.code === 'EACCES') {
        return {
          output: `ERROR [PERMISSION_DENIED]: Permission denied: ${resolved}`,
          isError: true,
          errorCode: 'PERMISSION_DENIED',
        }
      }
      if (isNodeError(err) && err.code === 'EISDIR') {
        return {
          output: `ERROR [INVALID_ARGS]: Path is a directory, not a file: ${resolved}`,
          isError: true,
          errorCode: 'INVALID_ARGS',
        }
      }
      return {
        output: `ERROR: Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      }
    }

    const lines = content.split('\n')
    const offset = Math.max(1, Number(args.offset) || 1)
    const limit = args.limit !== undefined ? Math.max(1, Number(args.limit)) : undefined

    const startIdx = offset - 1
    const sliced = limit !== undefined ? lines.slice(startIdx, startIdx + limit) : lines.slice(startIdx)

    const numbered = sliced.map((line, i) => `${offset + i}\t${line}`).join('\n')
    const totalLines = lines.length
    const shownFrom = offset
    const shownTo = offset + sliced.length - 1

    let header = `${resolved} (${totalLines} lines total`
    if (startIdx > 0 || limit !== undefined) {
      header += `, showing lines ${shownFrom}-${shownTo}`
    }
    header += ')'

    return { output: `${header}\n${numbered}`, isError: false }
  }
}

// ---------------------------------------------------------------------------
// file_read — contract
// ---------------------------------------------------------------------------

const contract: ToolContract = {
  toolName: 'file_read',
  whenToUse: [
    'Reading file contents when you already know the path.',
    'Inspecting specific line ranges of large files.',
  ],
  whenNotToUse: [
    'Do not use for locating files — use search or ls first.',
    'Do not use when you do not know the file path yet.',
  ],
  preconditions: ['You must know the file path. If unknown, use ls or search to find it first.'],
  failureSemantics: [
    'NOT_FOUND: file does not exist at the given path.',
    'PERMISSION_DENIED: insufficient permissions.',
    'INVALID_ARGS: path is a directory or arguments are missing.',
  ],
  fallbackHints: [
    'On NOT_FOUND, use ls to verify the path or search to locate the file.',
    'Use offset/limit for large files to avoid excessive output.',
  ],
  routeHints: {
    argMisusePatterns: [
      { argName: 'file_path', pattern: /[*?[\]]/, suggestTool: 'search', reason: 'glob pattern in file_path' },
    ],
  },
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const fileReadPlugin: ToolPlugin = {
  id: 'file_read',
  tool,
  createHandler: (ctx) => createFileReadHandler(ctx.cwd),
  contract,
  riskLevel: 'safe',
  category: 'core',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err
}
