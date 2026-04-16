// ---------------------------------------------------------------------------
// Shared tool display utilities
// ---------------------------------------------------------------------------

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  bash: 'Bash',
  file_read: 'Read',
  file_write: 'Write',
  file_edit: 'Edit',
  search: 'Search',
  ls: 'Ls',
}

/**
 * Human-friendly tool name for display.
 */
export function formatToolDisplayName(toolName: string): string {
  return TOOL_DISPLAY_NAMES[toolName] ?? toolName.slice(0, 1).toUpperCase() + toolName.slice(1)
}

/**
 * Derive an honest phase-feedback line for built-in tools in active phase
 * when no stdout/stderr is available yet.
 *
 * Returns null for tools that don't have a meaningful derived feedback,
 * letting the caller fall back to the generic phase label.
 */
export function derivePhaseFeedback(toolName: string, phase: string, args: Record<string, unknown>): string | null {
  if (phase !== 'executing') return null

  const filePath = typeof args.file_path === 'string' ? shortenPath(args.file_path) : null

  switch (toolName) {
    case 'file_read':
      return filePath ? `reading ${filePath}…` : 'reading file…'
    case 'file_write':
      return filePath ? `writing ${filePath}…` : 'writing file…'
    case 'file_edit':
      return filePath ? `editing ${filePath}…` : 'editing file…'
    case 'search': {
      const query = typeof args.query === 'string' ? args.query : null
      if (query) {
        const short = query.length > 30 ? query.slice(0, 29) + '…' : query
        return `searching "${short}"…`
      }
      return 'searching…'
    }
    case 'ls': {
      const path = typeof args.path === 'string' ? shortenPath(args.path) : '.'
      return `listing ${path}…`
    }
    default:
      return null
  }
}

/** Shorten an absolute path to at most the last 2 segments for display. */
function shortenPath(p: string): string {
  const segments = p.replace(/\/$/, '').split('/')
  if (segments.length <= 2) return p
  return '…/' + segments.slice(-2).join('/')
}

/**
 * Extract a meaningful one-line command summary from tool args.
 * Handles partial/streaming args gracefully (returns toolName if key args missing).
 */
export function extractToolCommand(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'bash':
      return typeof args.command === 'string' ? args.command : toolName

    case 'file_read':
    case 'file_write':
    case 'file_edit':
      return typeof args.file_path === 'string' ? args.file_path : toolName

    case 'search': {
      if (typeof args.query !== 'string') return toolName
      let cmd = args.query
      if (typeof args.path === 'string') cmd += ` in ${args.path}`
      if (typeof args.glob === 'string') cmd += ` --glob ${args.glob}`
      return cmd
    }

    case 'ls': {
      let cmd = typeof args.path === 'string' ? args.path : '.'
      if (args.recursive === true) cmd += ' --recursive'
      if (typeof args.glob === 'string') cmd += ` --glob ${args.glob}`
      return cmd
    }

    default:
      return typeof args.command === 'string' ? args.command : toolName
  }
}
