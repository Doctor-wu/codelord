// ---------------------------------------------------------------------------
// Tool result → one-line summary (heuristic extraction)
// ---------------------------------------------------------------------------

const MAX_THOUGHT = 60
const MAX_RESULT_HEAD_LINES = 4
const MAX_RESULT_TAIL_LINES = 1

function truncateSummary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 1) + '\u2026'
}

function charDisplayWidth(char: string): number {
  const codePoint = char.codePointAt(0) ?? 0

  if (
    (codePoint >= 0x1100 && codePoint <= 0x115f)
    || (codePoint >= 0x2329 && codePoint <= 0x232a)
    || (codePoint >= 0x2e80 && codePoint <= 0xa4cf)
    || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0xfe10 && codePoint <= 0xfe19)
    || (codePoint >= 0xfe30 && codePoint <= 0xfe6f)
    || (codePoint >= 0xff00 && codePoint <= 0xff60)
    || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
    || (codePoint >= 0x1f300 && codePoint <= 0x1f64f)
    || (codePoint >= 0x1f900 && codePoint <= 0x1f9ff)
    || (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  ) {
    return 2
  }

  return 1
}

export function getDisplayWidth(text: string): number {
  let width = 0
  for (const char of text) {
    width += charDisplayWidth(char)
  }
  return width
}

function truncateByDisplayWidth(text: string, maxWidth: number): string {
  if (getDisplayWidth(text) <= maxWidth) return text

  let width = 0
  let result = ''
  const ellipsisWidth = 1

  for (const char of text) {
    const nextWidth = charDisplayWidth(char)
    if (width + nextWidth + ellipsisWidth > maxWidth) break
    result += char
    width += nextWidth
  }

  return result.trimEnd() + '\u2026'
}

/**
 * Summarize a thought string to the first sentence, truncated.
 */
export function summarizeThought(thought: string): string {
  if (!thought) return ''
  // Take first sentence (up to period, newline, or question mark)
  const first = thought.split(/[.\n?!]/)[0]?.trim() ?? ''
  return truncateSummary(first, MAX_THOUGHT)
}

/**
 * Summarize text content to the first line, truncated.
 */
export function summarizeText(text: string): string {
  if (!text) return ''
  const firstLine = text.split('\n')[0]?.trim() ?? ''
  return truncateSummary(firstLine, MAX_THOUGHT)
}

/**
 * Normalize a multi-line command into a single inline string.
 */
export function normalizeInline(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Wrap text into a small number of lines, truncating the last line with ellipsis.
 */
export function wrapInlineText(
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const normalized = normalizeInline(text)
  if (!normalized) return ['']

  const lines: string[] = []
  let remaining = normalized

  while (remaining && lines.length < maxLines) {
    if (getDisplayWidth(remaining) <= maxWidth) {
      lines.push(remaining)
      remaining = ''
      break
    }

    if (lines.length === maxLines - 1) {
      lines.push(truncateByDisplayWidth(remaining, maxWidth))
      remaining = ''
      break
    }

    const segment = sliceByDisplayWidthAtWordBoundary(remaining, maxWidth)
    lines.push(segment.trimEnd())
    remaining = remaining.slice(segment.length).trimStart()
  }

  return lines
}

export function wrapPlainText(text: string, maxWidth: number): string[] {
  const width = Math.max(1, maxWidth)
  const logicalLines = text.split('\n')
  const wrapped: string[] = []

  for (const logicalLine of logicalLines) {
    if (logicalLine.length === 0) {
      wrapped.push('')
      continue
    }

    let remaining = logicalLine
    while (getDisplayWidth(remaining) > width) {
      const segment = sliceByDisplayWidth(remaining, width)
      wrapped.push(segment)
      remaining = remaining.slice(segment.length)
    }

    wrapped.push(remaining)
  }

  return wrapped
}

function sliceByDisplayWidth(text: string, maxWidth: number): string {
  let width = 0
  let result = ''

  for (const char of text) {
    const nextWidth = charDisplayWidth(char)
    if (width + nextWidth > maxWidth) break
    result += char
    width += nextWidth
  }

  return result || text[0] || ''
}

function sliceByDisplayWidthAtWordBoundary(text: string, maxWidth: number): string {
  const segment = sliceByDisplayWidth(text, maxWidth)
  if (segment.length === text.length) return segment

  const breakIndex = segment.lastIndexOf(' ')
  if (breakIndex <= 0) return segment
  return segment.slice(0, breakIndex)
}

/**
 * Summarize a tool result into a short string like "86 lines", "4 items", etc.
 */
export function summarizeResult(result: string, isError: boolean, toolName: string): string {
  if (isError) {
    const firstLine = result.split('\n').find((l) => l.trim().length > 0) ?? 'failed'
    const short = firstLine.trim().slice(0, 50)
    return `error: ${short}`
  }

  // Tool-specific summaries
  switch (toolName) {
    case 'file_edit':
      return '1 replacement'
    case 'file_write': {
      const match = result.match(/Wrote (\d+) lines/)
      return match ? `${match[1]} lines written` : 'done'
    }
    case 'search': {
      if (result.startsWith('No matches')) return 'no matches'
      const matchLines = result.split('\n').filter((l) => /^\S+:\d+:/.test(l))
      return matchLines.length > 0 ? `${matchLines.length} matches` : 'done'
    }
  }

  const lines = result.split('\n')
  const nonEmpty = lines.filter((l) => l.trim().length > 0)

  if (/^(ls|find|tree|glob)\b/i.test(toolName)) {
    return `${nonEmpty.length} items`
  }

  if (nonEmpty.length > 0) {
    return `${nonEmpty.length} lines`
  }

  return 'done'
}

export function formatToolResultLines(result: string): {
  headLines: string[]
  tailLines: string[]
  hiddenLineCount: number
} {
  const normalized = result.replace(/\n+$/, '')
  if (!normalized) {
    return {
      headLines: [],
      tailLines: [],
      hiddenLineCount: 0,
    }
  }

  const lines = normalized.split('\n')
  const maxVisibleLines = MAX_RESULT_HEAD_LINES + MAX_RESULT_TAIL_LINES

  if (lines.length <= maxVisibleLines) {
    return {
      headLines: lines,
      tailLines: [],
      hiddenLineCount: 0,
    }
  }

  return {
    headLines: lines.slice(0, MAX_RESULT_HEAD_LINES),
    tailLines: lines.slice(-MAX_RESULT_TAIL_LINES),
    hiddenLineCount: lines.length - maxVisibleLines,
  }
}
