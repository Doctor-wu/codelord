// ---------------------------------------------------------------------------
// Tool result → one-line summary (heuristic extraction)
// ---------------------------------------------------------------------------

const MAX_THOUGHT = 60
const MAX_COMMAND = 40

/**
 * Summarize a thought string to the first sentence, truncated.
 */
export function summarizeThought(thought: string): string {
  if (!thought) return ''
  // Take first sentence (up to period, newline, or question mark)
  const first = thought.split(/[.\n?!]/)[0]?.trim() ?? ''
  if (first.length <= MAX_THOUGHT) return first
  return first.slice(0, MAX_THOUGHT - 1) + '\u2026'
}

/**
 * Summarize a command string, truncated.
 */
export function summarizeCommand(command: string): string {
  const trimmed = command.trim()
  if (trimmed.length <= MAX_COMMAND) return trimmed
  return trimmed.slice(0, MAX_COMMAND - 1) + '\u2026'
}

/**
 * Summarize a tool result into a short string like "86 lines", "4 items", etc.
 */
export function summarizeResult(result: string, isError: boolean, toolName: string): string {
  if (isError) {
    // Extract first meaningful line from error
    const firstLine = result.split('\n').find((l) => l.trim().length > 0) ?? 'failed'
    const short = firstLine.trim().slice(0, 50)
    return `error: ${short}`
  }

  // Count lines in the output
  const lines = result.split('\n')
  const nonEmpty = lines.filter((l) => l.trim().length > 0)

  // ls-like commands → item count
  if (/^(ls|find|tree|glob)\b/i.test(toolName)) {
    return `${nonEmpty.length} items`
  }

  // Commands with line-based output
  if (nonEmpty.length > 0) {
    return `${nonEmpty.length} lines`
  }

  return 'done'
}
