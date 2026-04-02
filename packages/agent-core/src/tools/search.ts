import { spawn } from 'node:child_process'
import { Type } from '@mariozechner/pi-ai'
import type { Tool } from '@mariozechner/pi-ai'
import type { ToolExecutionResult, ToolHandler } from '../react-loop.js'

// ---------------------------------------------------------------------------
// search — tool definition
// ---------------------------------------------------------------------------

export const searchTool: Tool = {
  name: 'search',
  description: [
    'Search for text patterns across files in a directory tree.',
    'Use this to locate code, symbols, error messages, or configuration values',
    'when you do not know which file contains them.',
    'Uses ripgrep (rg) when available, falls back to grep.',
  ].join(' '),
  parameters: Type.Object({
    query: Type.String({ description: 'The search pattern (literal string or regex if regex=true).' }),
    path: Type.Optional(
      Type.String({ description: 'Directory or file to search in. Defaults to cwd.' }),
    ),
    glob: Type.Optional(
      Type.String({ description: 'Glob pattern to filter files (e.g. "*.ts", "**/*.json").' }),
    ),
    regex: Type.Optional(
      Type.Boolean({ description: 'Treat query as a regex pattern. Defaults to false (literal).' }),
    ),
    context_lines: Type.Optional(
      Type.Number({ description: 'Number of context lines before and after each match. Defaults to 0.' }),
    ),
    max_results: Type.Optional(
      Type.Number({ description: 'Maximum number of matching lines to return. Defaults to 100.' }),
    ),
  }),
}

// ---------------------------------------------------------------------------
// search — handler factory
// ---------------------------------------------------------------------------

export interface SearchOptions {
  cwd?: string
  timeout?: number
}

const DEFAULT_MAX_RESULTS = 100
const MAX_OUTPUT_CHARS = 30_000

export function createSearchHandler(options: SearchOptions = {}): ToolHandler {
  const { cwd = process.cwd(), timeout = 15_000 } = options

  return async (args) => {
    const query = args.query as string | undefined
    if (!query || typeof query !== 'string') {
      return { output: 'ERROR [INVALID_ARGS]: query is required and must be a string.', isError: true, errorCode: 'INVALID_ARGS' }
    }

    const searchPath = typeof args.path === 'string' ? resolvePath(cwd, args.path) : cwd
    const useRegex = args.regex === true
    const contextLines = Math.max(0, Number(args.context_lines) || 0)
    const maxResults = Math.max(1, Number(args.max_results) || DEFAULT_MAX_RESULTS)
    const glob = typeof args.glob === 'string' ? args.glob : undefined

    const rgArgs = buildRgArgs({ query, searchPath, useRegex, contextLines, maxResults, glob })

    return new Promise<ToolExecutionResult>((resolve) => {
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
        resolve({ output: 'ERROR: Search timed out.', isError: true })
      }, timeout)

      child.on('close', (code) => {
        clearTimeout(timeoutId)

        // rg exit codes: 0=matches found, 1=no matches, 2=error
        if (code === 1 || (!output.trim() && code === 0)) {
          resolve({ output: `No matches found for: ${query}`, isError: false })
          return
        }

        let result = output.trim()
        if (truncated) {
          result += `\n[output truncated at ${MAX_OUTPUT_CHARS} chars]`
        }
        resolve({ output: result || `No matches found for: ${query}`, isError: false })
      })

      child.on('error', (err) => {
        clearTimeout(timeoutId)
        if (isNodeError(err) && err.code === 'ENOENT') {
          resolve(grepFallback({ query, searchPath, useRegex, contextLines, maxResults, cwd, timeout }))
          return
        }
        resolve({ output: `ERROR: Search failed: ${err.message}`, isError: true })
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
    '--color', 'never',
    '--max-count', String(params.maxResults),
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

  return new Promise<ToolExecutionResult>((resolve) => {
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
      resolve({ output: 'ERROR: Search timed out.', isError: true })
    }, params.timeout)

    child.on('close', (code) => {
      clearTimeout(timeoutId)
      if (code === 1 || !output.trim()) {
        resolve({ output: `No matches found for: ${params.query}`, isError: false })
        return
      }
      resolve({ output: output.trim(), isError: false })
    })

    child.on('error', () => {
      clearTimeout(timeoutId)
      resolve({ output: 'ERROR: Neither rg nor grep is available.', isError: true })
    })
  })
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
