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
  return TOOL_DISPLAY_NAMES[toolName] ?? (toolName.slice(0, 1).toUpperCase() + toolName.slice(1))
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
