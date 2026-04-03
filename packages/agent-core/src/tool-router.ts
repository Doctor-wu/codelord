// ---------------------------------------------------------------------------
// Tool Router v1 — conservative, deterministic bash-to-built-in routing
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Route decision — the output of routing a single tool call
// ---------------------------------------------------------------------------

export interface ToolRouteDecision {
  /** Tool name as emitted by the model */
  originalToolName: string
  /** Args as emitted by the model */
  originalArgs: Record<string, unknown>
  /** Tool name that will actually execute */
  resolvedToolName: string
  /** Args that will be passed to the resolved handler */
  resolvedArgs: Record<string, unknown>
  /** Whether the router changed the tool call */
  wasRouted: boolean
  /** Which rule matched (null if not routed) */
  ruleId: string | null
  /** Human-readable reason (null if not routed) */
  reason: string | null
}

// ---------------------------------------------------------------------------
// Shell complexity guard — reject anything with pipes, redirects, etc.
// ---------------------------------------------------------------------------

/**
 * Returns true if the command string contains shell meta-characters that
 * make it unsafe to route (pipes, redirects, logical operators, subshells,
 * command substitution, semicolons, backgrounding).
 */
function hasShellComplexity(cmd: string): boolean {
  // Match unescaped shell operators.
  // We do a simple scan — good enough for obvious cases.
  return /[|&;<>`$(){}]/.test(cmd)
}

// ---------------------------------------------------------------------------
// Individual routing rules
// ---------------------------------------------------------------------------

interface RouteRule {
  id: string
  /** Try to match and rewrite. Return null if no match. */
  match(command: string): { toolName: string; args: Record<string, unknown>; reason: string } | null
}

// --- Rule A: cat <file> → file_read ---

const ruleCat: RouteRule = {
  id: 'bash_cat_to_file_read',
  match(command) {
    if (hasShellComplexity(command)) return null

    const m = command.match(/^\s*cat\s+(.+?)\s*$/)
    if (!m) return null

    const rest = m[1]
    // Must be a single argument (no spaces unless quoted, no wildcards)
    if (/[*?[\]]/.test(rest)) return null
    // Multiple files (space-separated, not a single quoted path)
    const parts = splitSimpleArgs(rest)
    if (parts.length !== 1) return null

    const filePath = unquote(parts[0])
    if (!filePath) return null

    return {
      toolName: 'file_read',
      args: { file_path: filePath },
      reason: 'Simple `cat <file>` routed to file_read',
    }
  },
}

// --- Rule B: head -n N <file> → file_read ---

const ruleHead: RouteRule = {
  id: 'bash_head_to_file_read',
  match(command) {
    if (hasShellComplexity(command)) return null

    // head -n N file  OR  head -N file
    const m1 = command.match(/^\s*head\s+-n\s+(\d+)\s+(.+?)\s*$/)
    const m2 = command.match(/^\s*head\s+-(\d+)\s+(.+?)\s*$/)
    const m = m1 ?? m2
    if (!m) return null

    const n = parseInt(m[1], 10)
    const rest = m[2]
    if (isNaN(n) || n <= 0) return null
    if (/[*?[\]]/.test(rest)) return null

    const parts = splitSimpleArgs(rest)
    if (parts.length !== 1) return null

    const filePath = unquote(parts[0])
    if (!filePath) return null

    return {
      toolName: 'file_read',
      args: { file_path: filePath, offset: 1, limit: n },
      reason: `Simple \`head -n ${n}\` routed to file_read`,
    }
  },
}

// --- Rule C: ls / ls -R [path] → ls ---

const ruleLs: RouteRule = {
  id: 'bash_ls_to_ls',
  match(command) {
    if (hasShellComplexity(command)) return null

    // Match: ls, ls path, ls -R, ls -R path, ls -la (reject complex flags)
    const m = command.match(/^\s*ls(\s+.*?)?\s*$/)
    if (!m) return null

    const rest = (m[1] ?? '').trim()
    if (!rest) {
      // bare `ls`
      return { toolName: 'ls', args: {}, reason: 'Simple `ls` routed to built-in ls' }
    }

    const parts = splitSimpleArgs(rest)
    // Only allow: optional -R flag + optional path
    let recursive = false
    let path: string | undefined

    for (const part of parts) {
      if (part === '-R') {
        recursive = true
      } else if (part.startsWith('-')) {
        // Unknown flag — bail
        return null
      } else {
        if (path !== undefined) return null // multiple paths — bail
        path = unquote(part)
      }
    }

    const args: Record<string, unknown> = {}
    if (path) args.path = path
    if (recursive) args.recursive = true

    return {
      toolName: 'ls',
      args,
      reason: `Simple \`ls${recursive ? ' -R' : ''}${path ? ' <path>' : ''}\` routed to built-in ls`,
    }
  },
}

// --- Rule D: rg / grep -rn → search ---

const ruleSearch: RouteRule = {
  id: 'bash_search_to_search',
  match(command) {
    if (hasShellComplexity(command)) return null

    // Try rg first, then grep
    return matchRg(command) ?? matchGrep(command) ?? null
  },
}

function matchRg(command: string): { toolName: string; args: Record<string, unknown>; reason: string } | null {
  const m = command.match(/^\s*rg\s+(.+?)\s*$/)
  if (!m) return null

  const rest = m[1]
  const parts = splitSimpleArgs(rest)
  if (parts.length === 0) return null

  // Parse known rg flags conservatively
  let query: string | undefined
  let path: string | undefined
  let glob: string | undefined
  let contextLines: number | undefined

  let i = 0
  while (i < parts.length) {
    const p = parts[i]
    if (p === '--glob' || p === '-g') {
      if (i + 1 >= parts.length) return null
      glob = unquote(parts[++i])
    } else if (p === '-C' || p === '--context') {
      if (i + 1 >= parts.length) return null
      contextLines = parseInt(parts[++i], 10)
      if (isNaN(contextLines)) return null
    } else if (p === '--fixed-strings' || p === '-F') {
      // fine, literal mode is default for our search tool
    } else if (p === '--line-number' || p === '-n' || p === '--no-heading' || p === '--color=never') {
      // display flags — ignore
    } else if (p === '--') {
      // everything after -- is query [path]
      i++
      if (i < parts.length) query = unquote(parts[i])
      i++
      if (i < parts.length) path = unquote(parts[i])
      i++
      break
    } else if (p.startsWith('-')) {
      // Unknown flag — bail for safety
      return null
    } else {
      // Positional: first is query, second is path
      if (query === undefined) {
        query = unquote(p)
      } else if (path === undefined) {
        path = unquote(p)
      } else {
        return null // too many positionals
      }
    }
    i++
  }

  if (!query) return null

  const args: Record<string, unknown> = { query }
  if (path) args.path = path
  if (glob) args.glob = glob
  if (contextLines !== undefined) args.context_lines = contextLines

  return {
    toolName: 'search',
    args,
    reason: 'Simple `rg` routed to built-in search',
  }
}

function matchGrep(command: string): { toolName: string; args: Record<string, unknown>; reason: string } | null {
  const m = command.match(/^\s*grep\s+(.+?)\s*$/)
  if (!m) return null

  const rest = m[1]
  const parts = splitSimpleArgs(rest)
  if (parts.length === 0) return null

  // Only support grep with -r/-rn flags (recursive search)
  let hasRecursive = false
  let hasLineNumber = false
  let query: string | undefined
  let path: string | undefined

  let i = 0
  while (i < parts.length) {
    const p = parts[i]
    if (p === '-r' || p === '-R') {
      hasRecursive = true
    } else if (p === '-n') {
      hasLineNumber = true
    } else if (p === '-rn' || p === '-Rn' || p === '-nr' || p === '-nR') {
      hasRecursive = true
      hasLineNumber = true
    } else if (p === '--color=never') {
      // ignore
    } else if (p === '-F') {
      // fixed strings — fine
    } else if (p === '--') {
      i++
      if (i < parts.length) query = unquote(parts[i])
      i++
      if (i < parts.length) path = unquote(parts[i])
      i++
      break
    } else if (p.startsWith('-')) {
      // Unknown flag — bail
      return null
    } else {
      if (query === undefined) {
        query = unquote(p)
      } else if (path === undefined) {
        path = unquote(p)
      } else {
        return null
      }
    }
    i++
  }

  if (!hasRecursive || !query) return null

  const args: Record<string, unknown> = { query }
  if (path) args.path = path

  return {
    toolName: 'search',
    args,
    reason: `Simple \`grep${hasLineNumber ? ' -rn' : ' -r'}\` routed to built-in search`,
  }
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Split a string into shell-like arguments (simple: no nested quotes) */
function splitSimpleArgs(input: string): string[] {
  const args: string[] = []
  let current = ''
  let inSingle = false
  let inDouble = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle
      current += ch
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble
      current += ch
    } else if ((ch === ' ' || ch === '\t') && !inSingle && !inDouble) {
      if (current) {
        args.push(current)
        current = ''
      }
    } else {
      current += ch
    }
  }
  if (current) args.push(current)
  return args
}

/** Remove surrounding quotes from a string */
function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1)
  }
  return s
}

// ---------------------------------------------------------------------------
// ToolRouter — the main router class
// ---------------------------------------------------------------------------

const RULES: readonly RouteRule[] = [ruleCat, ruleHead, ruleLs, ruleSearch]

export class ToolRouter {
  /**
   * Route a tool call. Returns a decision describing whether and how
   * the call was rewritten.
   */
  route(toolName: string, args: Record<string, unknown>): ToolRouteDecision {
    const base: Omit<ToolRouteDecision, 'resolvedToolName' | 'resolvedArgs' | 'wasRouted' | 'ruleId' | 'reason'> = {
      originalToolName: toolName,
      originalArgs: args,
    }

    // Only route bash tool calls
    if (toolName !== 'bash') {
      return { ...base, resolvedToolName: toolName, resolvedArgs: args, wasRouted: false, ruleId: null, reason: null }
    }

    const command = typeof args.command === 'string' ? args.command : ''
    if (!command) {
      return { ...base, resolvedToolName: toolName, resolvedArgs: args, wasRouted: false, ruleId: null, reason: null }
    }

    for (const rule of RULES) {
      const result = rule.match(command)
      if (result) {
        return {
          ...base,
          resolvedToolName: result.toolName,
          resolvedArgs: result.args,
          wasRouted: true,
          ruleId: rule.id,
          reason: result.reason,
        }
      }
    }

    // No rule matched — pass through
    return { ...base, resolvedToolName: toolName, resolvedArgs: args, wasRouted: false, ruleId: null, reason: null }
  }
}
