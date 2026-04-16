import { spawn } from 'node:child_process'
import { Type } from '@codelord/core'
import type { Tool } from '@codelord/core'
import type { ToolPlugin } from '@codelord/core'
import type { ToolExecutionContext, ToolExecutionResult, ToolHandler } from '@codelord/core'
import type { ToolContract } from '@codelord/core'

// ---------------------------------------------------------------------------
// Bash tool definition
// ---------------------------------------------------------------------------

const tool: Tool = {
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
    reason: Type.Optional(
      Type.String({ description: 'Brief explanation of why you are calling this tool for this specific step.' }),
    ),
  }),
}

// ---------------------------------------------------------------------------
// Bash tool handler factory
// ---------------------------------------------------------------------------

function createBashHandler(cwd: string, timeout: number, maxOutput: number): ToolHandler {
  return async (args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolExecutionResult> => {
    const command = args.command as string
    if (!command || typeof command !== 'string') {
      return {
        output: 'ERROR [INVALID_ARGS]: bash tool requires a "command" string argument',
        isError: true,
        errorCode: 'INVALID_ARGS',
      }
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

        const nextChunk = remainingOutput > 0 ? chunk.slice(0, remainingOutput) : ''

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
        const exitCode = didTimeout ? null : (code ?? 1)
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

const contract: ToolContract = {
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
    'Do not use bash curl/wget for web access when web_search and web_fetch tools are available — prefer those dedicated tools for better results and lower token usage.',
  ],
  preconditions: ['The command must be a valid shell command.'],
  failureSemantics: [
    'Non-zero exit code means the command failed (isError=true).',
    'Timeout means the command ran too long (isError=true).',
  ],
  fallbackHints: [
    'Check stderr output for error details.',
    'For permission errors, consider if the command needs elevated privileges.',
  ],
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT = 30_000
const DEFAULT_MAX_OUTPUT = 10_000

export const bashPlugin: ToolPlugin = {
  id: 'bash',
  tool,
  createHandler: (ctx) =>
    createBashHandler(
      ctx.cwd,
      (ctx.config.timeout as number | undefined) ?? DEFAULT_TIMEOUT,
      (ctx.config.maxOutput as number | undefined) ?? DEFAULT_MAX_OUTPUT,
    ),
  contract,
  riskLevel: 'dangerous',
  category: 'core',
}
