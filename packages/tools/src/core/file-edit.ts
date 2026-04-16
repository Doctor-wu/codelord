import { readFile, writeFile } from 'node:fs/promises'
import { resolve, isAbsolute } from 'node:path'
import { Type } from '@codelord/core'
import type { Tool } from '@codelord/core'
import type { ToolPlugin, ToolPluginContext } from '@codelord/core'
import type { ToolHandler, ToolExecutionResult } from '@codelord/core'
import type { ToolContract } from '@codelord/core'

// ---------------------------------------------------------------------------
// file_edit — tool definition
// ---------------------------------------------------------------------------

const tool: Tool = {
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
    reason: Type.Optional(
      Type.String({ description: 'Brief explanation of why you are calling this tool for this specific step.' }),
    ),
  }),
}

// ---------------------------------------------------------------------------
// file_edit — handler factory
// ---------------------------------------------------------------------------

function createFileEditHandler(cwd: string): ToolHandler {
  return async (args) => {
    const filePath = args.file_path as string | undefined
    if (!filePath || typeof filePath !== 'string') {
      return {
        output: 'ERROR [INVALID_ARGS]: file_path is required and must be a string.',
        isError: true,
        errorCode: 'INVALID_ARGS',
      }
    }
    if (typeof args.old_string !== 'string') {
      return {
        output: 'ERROR [INVALID_ARGS]: old_string is required and must be a string.',
        isError: true,
        errorCode: 'INVALID_ARGS',
      }
    }
    if (typeof args.new_string !== 'string') {
      return {
        output: 'ERROR [INVALID_ARGS]: new_string is required and must be a string.',
        isError: true,
        errorCode: 'INVALID_ARGS',
      }
    }

    const resolved = isAbsolute(filePath) ? resolve(filePath) : resolve(cwd, filePath)
    const oldString = args.old_string as string
    const newString = args.new_string as string

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
      return {
        output: `ERROR: Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      }
    }

    const matchCount = countOccurrences(content, oldString)

    if (matchCount === 0) {
      return {
        output: `ERROR [NO_MATCH]: old_string not found in ${resolved}. No changes made.`,
        isError: true,
        errorCode: 'NO_MATCH',
      }
    }
    if (matchCount > 1) {
      return {
        output: `ERROR [MULTI_MATCH]: old_string found ${matchCount} times in ${resolved}. Provide more context to match exactly once. No changes made.`,
        isError: true,
        errorCode: 'MULTI_MATCH',
      }
    }

    const updated = content.replace(oldString, newString)

    try {
      await writeFile(resolved, updated, 'utf-8')
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'EACCES') {
        return {
          output: `ERROR [PERMISSION_DENIED]: Permission denied writing to: ${resolved}`,
          isError: true,
          errorCode: 'PERMISSION_DENIED',
        }
      }
      return {
        output: `ERROR: Failed to write file: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      }
    }

    return { output: `OK: Replaced 1 occurrence in ${resolved}`, isError: false }
  }
}

// ---------------------------------------------------------------------------
// file_edit — contract
// ---------------------------------------------------------------------------

const contract: ToolContract = {
  toolName: 'file_edit',
  whenToUse: ['Making a targeted change in an existing file.', 'Replacing a specific code block, line, or string.'],
  whenNotToUse: [
    'Do not use if you do not know the exact content to replace.',
    'Do not use for creating new files — use file_write.',
    'Do not use for whole-file rewrites — use file_write.',
  ],
  preconditions: [
    'You must know the file path.',
    'old_string must appear exactly once in the file.',
    'Read the file first (file_read) if you are unsure of the exact content.',
  ],
  failureSemantics: [
    'NO_MATCH: old_string was not found — the file does not contain that text.',
    'MULTI_MATCH: old_string appears more than once — provide more surrounding context to make it unique.',
    'NOT_FOUND: the file does not exist.',
    'PERMISSION_DENIED: insufficient permissions.',
  ],
  fallbackHints: [
    'On NO_MATCH: use file_read to see the actual file content, then construct the correct old_string.',
    'On MULTI_MATCH: include more surrounding lines in old_string to make the match unique.',
    'If the change is too complex for search-and-replace, use file_write to rewrite the entire file.',
  ],
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const fileEditPlugin: ToolPlugin = {
  id: 'file_edit',
  tool,
  createHandler: (ctx) => createFileEditHandler(ctx.cwd),
  contract,
  riskLevel: 'write',
  category: 'core',
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

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err
}
