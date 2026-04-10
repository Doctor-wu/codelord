import { resolve, isAbsolute } from 'node:path'
import { homedir } from 'node:os'

// ---------------------------------------------------------------------------
// Risk levels
// ---------------------------------------------------------------------------

export type RiskLevel = 'safe' | 'write' | 'dangerous' | 'control'

// ---------------------------------------------------------------------------
// Safety decision — output of assessing a single tool call
// ---------------------------------------------------------------------------

export interface ToolSafetyDecision {
  toolName: string
  args: Record<string, unknown>
  riskLevel: RiskLevel
  allowed: boolean
  wasBlocked: boolean
  ruleId: string
  reason: string
}

// ---------------------------------------------------------------------------
// Default tool risk map (used when no riskMap is provided)
// ---------------------------------------------------------------------------

const DEFAULT_RISK: Record<string, RiskLevel> = {
  file_read: 'safe',
  search: 'safe',
  ls: 'safe',
  file_write: 'write',
  file_edit: 'write',
  AskUserQuestion: 'control',
}

// ---------------------------------------------------------------------------
// Sensitive path prefixes (write/edit protection only)
// ---------------------------------------------------------------------------

const HOME = homedir()

const SENSITIVE_PREFIXES: string[] = [
  resolve(HOME, '.ssh'),
  resolve(HOME, '.gnupg'),
  '/etc',
  '/System',
  '/Library',
  '/Applications',
]

function isSensitivePath(filePath: string, cwd: string): boolean {
  const abs = isAbsolute(filePath) ? resolve(filePath) : resolve(cwd, filePath)
  return SENSITIVE_PREFIXES.some(prefix => abs === prefix || abs.startsWith(prefix + '/'))
}

// ---------------------------------------------------------------------------
// Bash risk classification
// ---------------------------------------------------------------------------

/** Commands that are clearly read-only / observational */
const SAFE_COMMAND_PREFIXES = [
  'pwd', 'whoami', 'uname', 'date', 'echo ',
  'cat ', 'head ', 'tail ', 'wc ',
  'ls', 'tree',
  'rg ', 'grep ',
  'git status', 'git diff', 'git log', 'git show',
]

/** Exact safe commands (no args needed) */
const SAFE_COMMANDS_EXACT = new Set([
  'pwd', 'whoami', 'uname', 'date', 'ls', 'tree',
  'git status', 'git diff', 'git log',
  'git branch', 'git branch --list', 'git branch --show-current',
])

/** Version check patterns */
const VERSION_PATTERNS = [
  /^\s*\S+\s+(-v|--version|-V)\s*$/,
  /^\s*(node|python|python3|ruby|go|rustc|java|pnpm|npm|yarn|bun|deno)\s+(-v|--version)\s*$/,
]

/** Dangerous command patterns */
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; ruleId: string; reason: string }> = [
  { pattern: /\brm\s+(-\w*r|-\w*f|--recursive|--force)\b/, ruleId: 'bash_rm_recursive_or_force', reason: 'rm with -r or -f flags' },
  { pattern: /\bsudo\b/, ruleId: 'bash_sudo', reason: 'sudo escalation' },
  { pattern: /\bchmod\b/, ruleId: 'bash_chmod', reason: 'permission change' },
  { pattern: /\bchown\b/, ruleId: 'bash_chown', reason: 'ownership change' },
  { pattern: /\bdd\b/, ruleId: 'bash_dd', reason: 'low-level disk write' },
  { pattern: /\bmkfs\b/, ruleId: 'bash_mkfs', reason: 'filesystem creation' },
  { pattern: /\bdiskutil\s+erase/, ruleId: 'bash_diskutil_erase', reason: 'disk erase' },
  { pattern: /\bshutdown\b/, ruleId: 'bash_shutdown', reason: 'system shutdown' },
  { pattern: /\breboot\b/, ruleId: 'bash_reboot', reason: 'system reboot' },
  // Dangerous git operations
  { pattern: /\bgit\s+reset\s+--hard\b/, ruleId: 'bash_git_reset_hard', reason: 'git reset --hard' },
  { pattern: /\bgit\s+clean\s+(-\w*f)/, ruleId: 'bash_git_clean_force', reason: 'git clean with -f' },
  { pattern: /\bgit\s+checkout\s+--\s/, ruleId: 'bash_git_checkout_discard', reason: 'git checkout -- (discard changes)' },
  { pattern: /\bgit\s+branch\s+(-\w*D)/, ruleId: 'bash_git_branch_force_delete', reason: 'git branch -D (force delete)' },
  { pattern: /\bgit\s+push\s+(-\w*f|--force)\b/, ruleId: 'bash_git_push_force', reason: 'git push --force' },
]

/** Write-level command prefixes (mutating but not dangerous) */
const WRITE_COMMAND_PREFIXES = [
  'mkdir', 'touch', 'cp ', 'mv ', 'ln ',
  'tee ', 'patch ', 'git apply',
  'npm install', 'npm i ', 'npm ci',
  'pnpm install', 'pnpm i ', 'pnpm add',
  'yarn install', 'yarn add',
  'bun install', 'bun add',
]

function hasShellComplexity(cmd: string): boolean {
  return /[|&;<>`$(){}]/.test(cmd)
}

/** find actions that mutate the filesystem */
const FIND_MUTATING_ACTIONS = /\s-(delete|exec|execdir|ok|okdir)\b/

interface BashClassification {
  riskLevel: RiskLevel
  ruleId: string
  reason: string
}

function classifyBash(command: string): BashClassification {
  const trimmed = command.trim()

  // 1. Check dangerous patterns first (highest priority)
  for (const { pattern, ruleId, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { riskLevel: 'dangerous', ruleId, reason }
    }
  }

  // 2. Check if it's a safe command (only if no shell complexity)
  if (!hasShellComplexity(trimmed)) {
    // Exact matches
    if (SAFE_COMMANDS_EXACT.has(trimmed)) {
      return { riskLevel: 'safe', ruleId: 'bash_safe_exact', reason: `Safe command: ${trimmed}` }
    }

    // Prefix matches
    for (const prefix of SAFE_COMMAND_PREFIXES) {
      if (trimmed.startsWith(prefix)) {
        return { riskLevel: 'safe', ruleId: 'bash_safe_prefix', reason: `Safe read-only command: ${prefix.trim()}` }
      }
    }

    // Version checks
    for (const pattern of VERSION_PATTERNS) {
      if (pattern.test(trimmed)) {
        return { riskLevel: 'safe', ruleId: 'bash_version_check', reason: 'Version check command' }
      }
    }

    // find: only safe if no mutating actions
    if (trimmed.startsWith('find ') || trimmed === 'find') {
      if (!FIND_MUTATING_ACTIONS.test(trimmed)) {
        return { riskLevel: 'safe', ruleId: 'bash_safe_find', reason: 'Read-only find (no mutating actions)' }
      }
    }
  }

  // 3. Check write-level commands
  for (const prefix of WRITE_COMMAND_PREFIXES) {
    if (trimmed.startsWith(prefix)) {
      return { riskLevel: 'write', ruleId: 'bash_write_prefix', reason: `Write command: ${prefix.trim()}` }
    }
  }

  // 4. Default: unknown bash → write (conservative but usable)
  return { riskLevel: 'write', ruleId: 'bash_default_write', reason: 'Unknown bash command defaults to write' }
}

// ---------------------------------------------------------------------------
// Sensitive path check for bash commands
// ---------------------------------------------------------------------------

function bashTouchesSensitivePath(command: string, cwd: string): { hit: boolean; path?: string } {
  // Simple heuristic: check if any sensitive prefix appears as a token in the command
  const tokens = command.split(/\s+/)
  for (const token of tokens) {
    // Skip flags
    if (token.startsWith('-')) continue
    // Skip the command name itself
    if (token === tokens[0]) continue
    const abs = isAbsolute(token) ? resolve(token) : resolve(cwd, token)
    if (SENSITIVE_PREFIXES.some(prefix => abs === prefix || abs.startsWith(prefix + '/'))) {
      return { hit: true, path: token }
    }
  }
  // Also check for ~ expansion patterns
  if (/~\/\.ssh\b|~\/\.gnupg\b/.test(command)) {
    return { hit: true, path: command.match(/(~\/\.\w+)/)?.[1] }
  }
  return { hit: false }
}

// ---------------------------------------------------------------------------
// ToolSafetyPolicy — the main policy class
// ---------------------------------------------------------------------------

export interface ToolSafetyPolicyOptions {
  cwd?: string
  /** Per-tool risk levels, typically built from ToolPlugin.riskLevel */
  riskMap?: Record<string, RiskLevel>
}

export class ToolSafetyPolicy {
  private readonly cwd: string
  private readonly riskMap: Record<string, RiskLevel>

  constructor(options: ToolSafetyPolicyOptions = {}) {
    this.cwd = options.cwd ?? process.cwd()
    // AskUserQuestion is always 'control' regardless of what's passed in
    this.riskMap = { ...DEFAULT_RISK, ...options.riskMap, AskUserQuestion: 'control' }
  }

  assess(toolName: string, args: Record<string, unknown>): ToolSafetyDecision {
    const base = { toolName, args }

    // --- Static risk tools ---
    const staticRisk = this.riskMap[toolName]
    if (staticRisk) {
      // For write tools, check sensitive path
      if ((toolName === 'file_write' || toolName === 'file_edit') && typeof args.file_path === 'string') {
        if (isSensitivePath(args.file_path, this.cwd)) {
          return {
            ...base,
            riskLevel: 'dangerous',
            allowed: false,
            wasBlocked: true,
            ruleId: 'sensitive_path_write',
            reason: `Write to sensitive path blocked: ${args.file_path}`,
          }
        }
      }

      return {
        ...base,
        riskLevel: staticRisk,
        allowed: true,
        wasBlocked: false,
        ruleId: `static_${staticRisk}`,
        reason: `Static risk: ${toolName} is ${staticRisk}`,
      }
    }

    // --- Bash: dynamic classification ---
    if (toolName === 'bash') {
      const command = typeof args.command === 'string' ? args.command : ''
      const classification = classifyBash(command)

      // If classified as write or dangerous, also check sensitive paths
      if (classification.riskLevel !== 'safe') {
        const pathCheck = bashTouchesSensitivePath(command, this.cwd)
        if (pathCheck.hit) {
          return {
            ...base,
            riskLevel: 'dangerous',
            allowed: false,
            wasBlocked: true,
            ruleId: 'bash_sensitive_path',
            reason: `Bash command touches sensitive path: ${pathCheck.path}`,
          }
        }
      }

      const allowed = classification.riskLevel !== 'dangerous'
      return {
        ...base,
        riskLevel: classification.riskLevel,
        allowed,
        wasBlocked: !allowed,
        ruleId: classification.ruleId,
        reason: classification.reason,
      }
    }

    // --- Unknown tool: default to write ---
    return {
      ...base,
      riskLevel: 'write',
      allowed: true,
      wasBlocked: false,
      ruleId: 'unknown_tool_default',
      reason: `Unknown tool "${toolName}" defaults to write`,
    }
  }
}
