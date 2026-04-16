// ---------------------------------------------------------------------------
// Tool Router v2 — semantic routing + contracts integration
// ---------------------------------------------------------------------------

import type { ToolContract } from './tools/tool-contract.js'

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
// Route rule interface
// ---------------------------------------------------------------------------

interface RouteResult {
  toolName: string
  args: Record<string, unknown>
  reason: string
}

interface RouteRule {
  id: string
  /** Try to match and rewrite. Return null if no match. */
  match(toolName: string, args: Record<string, unknown>): RouteResult | null
}

// ---------------------------------------------------------------------------
// Bash command extraction helper
// ---------------------------------------------------------------------------

/** Extract the command string from bash tool args. Returns empty string if not bash or missing. */
function extractBashCommand(toolName: string, args: Record<string, unknown>): string {
  if (toolName !== 'bash') return ''
  return typeof args.command === 'string' ? args.command : ''
}

// ---------------------------------------------------------------------------
// Individual routing rules — bash rewrites (A–D)
// ---------------------------------------------------------------------------

// --- Rule A: cat <file> → file_read ---

const ruleCat: RouteRule = {
  id: 'bash_cat_to_file_read',
  match(toolName, args) {
    const command = extractBashCommand(toolName, args)
    if (!command || hasShellComplexity(command)) return null

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
  match(toolName, args) {
    const command = extractBashCommand(toolName, args)
    if (!command || hasShellComplexity(command)) return null

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
  match(toolName, toolArgs) {
    const command = extractBashCommand(toolName, toolArgs)
    if (!command || hasShellComplexity(command)) return null

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
  match(toolName, args) {
    const command = extractBashCommand(toolName, args)
    if (!command || hasShellComplexity(command)) return null

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
// Semantic routing rules (E–F) — cross-tool corrections
// ---------------------------------------------------------------------------

// --- Rule E: file_read with glob/wildcard → search ---

const ruleFileReadGlob: RouteRule = {
  id: 'file_read_glob_to_search',
  match(toolName, args) {
    if (toolName !== 'file_read') return null
    const filePath = args.file_path as string | undefined
    if (!filePath || !/[*?[\]]/.test(filePath)) return null
    return {
      toolName: 'search',
      args: { query: filePath, path: '.' },
      reason: 'file_read with glob pattern routed to search',
    }
  },
}

// --- Rule F: search with exact file path → file_read ---

const ruleSearchExactPath: RouteRule = {
  id: 'search_exact_path_to_file_read',
  match(toolName, args) {
    if (toolName !== 'search') return null
    const query = args.query as string | undefined
    if (!query) return null
    // Looks like a file path: has extension, no regex chars, no spaces
    if (/^[\w./-]+\.\w+$/.test(query) && !/ /.test(query)) {
      return {
        toolName: 'file_read',
        args: { file_path: query },
        reason: 'search with exact file path routed to file_read',
      }
    }
    return null
  },
}

// ---------------------------------------------------------------------------
// Contract-based rule generation
// ---------------------------------------------------------------------------

/** Route hint declared in a ToolContract — describes an arg misuse pattern */
export interface ArgMisusePattern {
  argName: string
  pattern: RegExp
  suggestTool: string
  reason: string
}

/** Optional routing hints on a ToolContract, consumed by the router */
export interface ContractRouteHints {
  argMisusePatterns?: ArgMisusePattern[]
}

/** Generate RouteRules from contract routeHints */
function generateContractRules(contracts: readonly ToolContract[]): RouteRule[] {
  const rules: RouteRule[] = []
  for (const contract of contracts) {
    const hints = contract.routeHints
    if (!hints?.argMisusePatterns) continue
    for (const pattern of hints.argMisusePatterns) {
      rules.push({
        id: `contract_${contract.toolName}_${pattern.argName}_misuse`,
        match(toolName, args) {
          if (toolName !== contract.toolName) return null
          const value = args[pattern.argName]
          if (typeof value !== 'string') return null
          if (!pattern.pattern.test(value)) return null
          return {
            toolName: pattern.suggestTool,
            args: { query: value, path: '.' },
            reason: `Contract hint: ${pattern.reason}`,
          }
        },
      })
    }
  }
  return rules
}

// ---------------------------------------------------------------------------
// Built-in rule sets
// ---------------------------------------------------------------------------

const BASH_RULES: readonly RouteRule[] = [ruleCat, ruleHead, ruleLs, ruleSearch]
const SEMANTIC_RULES: readonly RouteRule[] = [ruleFileReadGlob, ruleSearchExactPath]

export class ToolRouter {
  private readonly rules: readonly RouteRule[]

  constructor(contracts?: readonly ToolContract[]) {
    this.rules = [...BASH_RULES, ...SEMANTIC_RULES, ...(contracts ? generateContractRules(contracts) : [])]
  }

  /**
   * Route a tool call. Returns a decision describing whether and how
   * the call was rewritten.
   */
  route(toolName: string, args: Record<string, unknown>): ToolRouteDecision {
    const base: Omit<ToolRouteDecision, 'resolvedToolName' | 'resolvedArgs' | 'wasRouted' | 'ruleId' | 'reason'> = {
      originalToolName: toolName,
      originalArgs: args,
    }

    for (const rule of this.rules) {
      const result = rule.match(toolName, args)
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
