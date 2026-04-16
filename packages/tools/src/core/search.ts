import { spawn } from 'node:child_process'
import { resolve, isAbsolute } from 'node:path'
import { Type } from '@codelord/core'
import type { Tool } from '@codelord/core'
import type { ToolPlugin, ToolPluginContext } from '@codelord/core'
import type { ToolExecutionResult, ToolHandler } from '@codelord/core'
import type { ToolContract } from '@codelord/core'

// ---------------------------------------------------------------------------
// search — tool definition
// ---------------------------------------------------------------------------

const tool: Tool = {
  name: 'search',
  description: [
    'Search for text patterns across files in a directory tree.',
    'Use this to locate code, symbols, error messages, or configuration values',
    'when you do not know which file contains them.',
    'Uses ripgrep (rg) when available, falls back to grep.',
  ].join(' '),
  parameters: Type.Object({
    query: Type.String({ description: 'The search pattern (literal string or regex if regex=true).' }),
    path: Type.Optional(Type.String({ description: 'Directory or file to search in. Defaults to cwd.' })),
    glob: Type.Optional(Type.String({ description: 'Glob pattern to filter files (e.g. "*.ts", "**/*.json").' })),
    regex: Type.Optional(Type.Boolean({ description: 'Treat query as a regex pattern. Defaults to false (literal).' })),
    context_lines: Type.Optional(
      Type.Number({ description: 'Number of context lines before and after each match. Defaults to 0.' }),
    ),
    max_results: Type.Optional(
      Type.Number({ description: 'Maximum number of matching lines to return. Defaults to 100.' }),
    ),
    reason: Type.Optional(
      Type.String({ description: 'Brief explanation of why you are calling this tool for this specific step.' }),
    ),
  }),
}

// ---------------------------------------------------------------------------
// search — handler factory
// ---------------------------------------------------------------------------

const DEFAULT_MAX_RESULTS = 100
const MAX_OUTPUT_CHARS = 30_000

function createSearchHandler(cwd: string): ToolHandler {
  const timeout = 15_000

  return async (args) => {
    const query = args.query as string | undefined
    if (!query || typeof query !== 'string') {
      return {
        output: 'ERROR [INVALID_ARGS]: query is required and must be a string.',
        isError: true,
        errorCode: 'INVALID_ARGS',
      }
    }

    const searchPath =
      typeof args.path === 'string' ? (isAbsolute(args.path) ? resolve(args.path) : resolve(cwd, args.path)) : cwd
    const useRegex = args.regex === true
    const contextLines = Math.max(0, Number(args.context_lines) || 0)
    const maxResults = Math.max(1, Number(args.max_results) || DEFAULT_MAX_RESULTS)
    const glob = typeof args.glob === 'string' ? args.glob : undefined

    const rgArgs = buildRgArgs({ query, searchPath, useRegex, contextLines, maxResults, glob })

    return new Promise<ToolExecutionResult>((resolvePromise) => {
      const child = spawn('rg', rgArgs, { cwd, env: { ...process.env } })

      let output = ''
      let truncated = false

      child.stdout.on('data', (chunk: Buffer) => {
        if (output.length < MAX_OUTPUT_CHARS) {
          output += chunk.toString()
          if (output.length > MAX_OUTPUT_CHARS) {
            output = output.slice(0, MAX_OUTPUT_CHARS)
            truncated = true
            child.kill('SIGTERM')
          }
        }
      })

      child.stderr.on('data', () => {
        // rg writes warnings to stderr; ignore for now
      })

      const timeoutId = setTimeout(() => {
        child.kill('SIGTERM')
        resolvePromise({ output: 'ERROR: Search timed out.', isError: true })
      }, timeout)

      child.on('close', (code) => {
        clearTimeout(timeoutId)

        if (code === 1 || (!output.trim() && code === 0)) {
          resolvePromise({ output: `No matches found for: ${query}`, isError: false })
          return
        }

        let result = output.trim()
        if (truncated) {
          result += `\n[output truncated at ${MAX_OUTPUT_CHARS} chars]`
        }
        resolvePromise({ output: result || `No matches found for: ${query}`, isError: false })
      })

      child.on('error', (err) => {
        clearTimeout(timeoutId)
        if (isNodeError(err) && err.code === 'ENOENT') {
          resolvePromise(grepFallback({ query, searchPath, useRegex, contextLines, maxResults, cwd, timeout }))
          return
        }
        resolvePromise({ output: `ERROR: Search failed: ${err.message}`, isError: true })
      })
    })
  }
}

// ---------------------------------------------------------------------------
// rg argument builder
// ---------------------------------------------------------------------------

interface RgParams {
  query: string
  searchPath: string
  useRegex: boolean
  contextLines: number
  maxResults: number
  glob?: string
}

function buildRgArgs(params: RgParams): string[] {
  const rgArgs: string[] = [
    '--line-number',
    '--no-heading',
    '--color',
    'never',
    '--max-count',
    String(params.maxResults),
  ]

  if (!params.useRegex) {
    rgArgs.push('--fixed-strings')
  }

  if (params.contextLines > 0) {
    rgArgs.push('--context', String(params.contextLines))
  }

  if (params.glob) {
    rgArgs.push('--glob', params.glob)
  }

  rgArgs.push('--', params.query, params.searchPath)
  return rgArgs
}

// ---------------------------------------------------------------------------
// grep fallback (minimal)
// ---------------------------------------------------------------------------

interface GrepFallbackParams {
  query: string
  searchPath: string
  useRegex: boolean
  contextLines: number
  maxResults: number
  cwd: string
  timeout: number
}

function grepFallback(params: GrepFallbackParams): Promise<ToolExecutionResult> {
  const grepArgs: string[] = ['-rn', '--color=never']

  if (!params.useRegex) {
    grepArgs.push('-F')
  }

  if (params.contextLines > 0) {
    grepArgs.push(`-C${params.contextLines}`)
  }

  grepArgs.push('--', params.query, params.searchPath)

  return new Promise<ToolExecutionResult>((resolvePromise) => {
    const child = spawn('grep', grepArgs, { cwd: params.cwd, env: { ...process.env } })

    let output = ''
    let lineCount = 0

    child.stdout.on('data', (chunk: Buffer) => {
      if (lineCount < params.maxResults) {
        const text = chunk.toString()
        const lines = text.split('\n')
        for (const line of lines) {
          if (lineCount >= params.maxResults) break
          output += line + '\n'
          if (line.trim()) lineCount++
        }
      }
    })

    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM')
      resolvePromise({ output: 'ERROR: Search timed out.', isError: true })
    }, params.timeout)

    child.on('close', (code) => {
      clearTimeout(timeoutId)
      if (code === 1 || !output.trim()) {
        resolvePromise({ output: `No matches found for: ${params.query}`, isError: false })
        return
      }
      resolvePromise({ output: output.trim(), isError: false })
    })

    child.on('error', () => {
      clearTimeout(timeoutId)
      resolvePromise({ output: 'ERROR: Neither rg nor grep is available.', isError: true })
    })
  })
}

// ---------------------------------------------------------------------------
// search — contract
// ---------------------------------------------------------------------------

const contract: ToolContract = {
  toolName: 'search',
  whenToUse: [
    'Locating code, symbols, error messages, or config values across the codebase.',
    'Finding which files contain a specific pattern when the location is unknown.',
  ],
  whenNotToUse: [
    'Do not use when you already know the file path — use file_read directly.',
    'Do not use for browsing directory structure — use ls.',
  ],
  preconditions: ['A search query must be provided.'],
  failureSemantics: [
    'No matches found is NOT an error — the search completed successfully, there are simply no results.',
    'INVALID_ARGS: missing or invalid query.',
    'Timeout: search took too long.',
  ],
  fallbackHints: [
    'On no matches: try a broader query, different spelling, or remove glob filters.',
    'Use ls first to understand the directory structure, then narrow the search path.',
    'Try regex mode for more flexible pattern matching.',
  ],
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const searchPlugin: ToolPlugin = {
  id: 'search',
  tool,
  createHandler: (ctx) => createSearchHandler(ctx.cwd),
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
