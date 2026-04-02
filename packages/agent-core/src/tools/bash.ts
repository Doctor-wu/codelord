import { spawn } from 'node:child_process'
import { Type } from '@mariozechner/pi-ai'
import type { Tool } from '@mariozechner/pi-ai'
import type { ToolExecutionContext, ToolExecutionResult, ToolHandler } from '../react-loop.js'
import type { ToolContract } from './tool-contract.js'

// ---------------------------------------------------------------------------
// Bash tool definition
// ---------------------------------------------------------------------------

export const bashTool: Tool = {
  name: 'bash',
  description: [
    'Execute a shell command and return its stdout and stderr.',
    'Use this tool to explore codebases (ls, find, cat, head, tail),',
    'search code (grep, rg), read/write files, run tests (npm test),',
    'install dependencies, and perform any shell operation.',
    'Commands are executed via `sh -c`, so pipes and redirects work.',
  ].join(' '),
  parameters: Type.Object({
    command: Type.String({ description: 'The shell command to execute' }),
  }),
}

// ---------------------------------------------------------------------------
// Bash tool handler factory
// ---------------------------------------------------------------------------

export interface BashToolOptions {
  /** Working directory for command execution. Defaults to process.cwd(). */
  cwd?: string
  /** Timeout in milliseconds. Defaults to 30_000 (30s). */
  timeout?: number
  /** Max output characters before truncation. Defaults to 10_000. */
  maxOutput?: number
}

export function createBashToolHandler(options: BashToolOptions = {}): ToolHandler {
  const {
    cwd = process.cwd(),
    timeout = 30_000,
    maxOutput = 10_000,
  } = options

  return async (
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> => {
    const command = args.command as string
    if (!command || typeof command !== 'string') {
      return { output: 'ERROR [INVALID_ARGS]: bash tool requires a "command" string argument', isError: true, errorCode: 'INVALID_ARGS' }
    }

    return new Promise<ToolExecutionResult>((resolve, reject) => {
      const child = spawn('sh', ['-c', command], {
        cwd,
        env: { ...process.env },
      })

      let stdout = ''
      let stderr = ''
      let remainingOutput = maxOutput
      let wasTruncated = false
      let didTimeout = false

      const appendChunk = (stream: 'stdout' | 'stderr', chunk: string) => {
        if (!chunk) return

        const nextChunk = remainingOutput > 0
          ? chunk.slice(0, remainingOutput)
          : ''

        if (nextChunk) {
          context.emitOutput(stream, nextChunk)
          remainingOutput -= nextChunk.length
          if (stream === 'stdout') stdout += nextChunk
          else stderr += nextChunk
        }

        if (nextChunk.length < chunk.length) {
          wasTruncated = true
        }
      }

      child.stdout.on('data', (chunk: Buffer) => {
        appendChunk('stdout', chunk.toString())
      })

      child.stderr.on('data', (chunk: Buffer) => {
        appendChunk('stderr', chunk.toString())
      })

      const timeoutId = setTimeout(() => {
        didTimeout = true
        appendChunk('stderr', `Command timed out after ${timeout}ms`)
        child.kill('SIGTERM')
      }, timeout)

      child.on('close', (code) => {
        clearTimeout(timeoutId)
        const exitCode = didTimeout ? null : code ?? 1
        const output = formatOutput(exitCode, stdout, stderr, undefined, wasTruncated)
        const isError = didTimeout || (exitCode !== null && exitCode !== 0)
        resolve({ output, isError })
      })

      child.on('error', (err) => {
        clearTimeout(timeoutId)
        reject(new Error(`Failed to spawn command: ${err.message}`))
      })
    })
  }

  function formatOutput(
    exitCode: number | null,
    stdout: string,
    stderr: string,
    errorMsg?: string,
    wasTruncated = false,
  ): string {
    if (errorMsg) {
      return `error: ${errorMsg}`
    }

    let output = `exit code: ${exitCode}\n`

    if (stdout) {
      output += `stdout:\n${stdout}`
    }
    if (stderr) {
      output += `${stdout ? '\n' : ''}stderr:\n${stderr}`
    }
    if (!stdout && !stderr) {
      output += '(no output)'
    }

    if (wasTruncated) {
      output += `\n[output truncated, showing first ${maxOutput} chars]`
    }

    return output
  }
}

// ---------------------------------------------------------------------------
// Bash tool contract
// ---------------------------------------------------------------------------

export const bashContract: ToolContract = {
  toolName: 'bash',
  whenToUse: [
    'Shell pipelines, git commands, build tools, test runners, package managers.',
    'Commands that combine multiple operations (pipes, redirects, loops).',
    'Any operation not covered by a dedicated built-in tool.',
  ],
  whenNotToUse: [
    'Do not use bash cat/head/tail when you already know the file path — use file_read.',
    'Do not use bash sed/awk for precise edits — use file_edit.',
    'Do not use bash ls for simple directory browsing — use ls.',
    'Do not use bash grep/rg for code search — use search.',
  ],
  preconditions: [
    'The command must be a valid shell command.',
  ],
  failureSemantics: [
    'Non-zero exit code means the command failed (isError=true).',
    'Timeout means the command ran too long (isError=true).',
  ],
  fallbackHints: [
    'Check stderr output for error details.',
    'For permission errors, consider if the command needs elevated privileges.',
  ],
}
