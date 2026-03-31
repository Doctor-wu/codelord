import { execFile } from 'node:child_process'
import { Type } from '@mariozechner/pi-ai'
import type { Tool } from '@mariozechner/pi-ai'
import type { ToolHandler } from '../react-loop.js'

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

  return async (args: Record<string, unknown>): Promise<string> => {
    const command = args.command as string
    if (!command || typeof command !== 'string') {
      throw new Error('bash tool requires a "command" string argument')
    }

    return new Promise<string>((resolve, reject) => {
      const child = execFile(
        'sh',
        ['-c', command],
        {
          cwd,
          timeout,
          maxBuffer: 1024 * 1024, // 1MB buffer
          env: { ...process.env },
        },
        (error, stdout, stderr) => {
          // execFile callback fires on completion or timeout/kill
          if (error && error.killed) {
            // Process was killed (likely timeout)
            resolve(formatOutput(null, '', '', `Command timed out after ${timeout}ms`))
            return
          }

          const exitCode = error ? error.code ?? 1 : 0
          const result = formatOutput(exitCode as number, stdout, stderr)
          resolve(result)
        },
      )

      // Guard against spawn errors (e.g. ENOENT)
      child.on('error', (err) => {
        reject(new Error(`Failed to spawn command: ${err.message}`))
      })
    })
  }

  function formatOutput(
    exitCode: number | null,
    stdout: string,
    stderr: string,
    errorMsg?: string,
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

    // Truncate if too long
    if (output.length > maxOutput) {
      output = output.slice(0, maxOutput) + `\n[output truncated, showing first ${maxOutput} chars]`
    }

    return output
  }
}
