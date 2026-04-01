// ---------------------------------------------------------------------------
// Bash command → StepCategory classification
// ---------------------------------------------------------------------------

import type { StepCategory } from './theme.js'

const READ_TOKENS = new Set([
  'ls', 'cat', 'head', 'tail', 'find', 'grep', 'rg', 'wc',
  'file', 'tree', 'pwd', 'which', 'echo', 'less', 'more',
  'stat', 'du', 'df', 'env', 'printenv', 'type', 'realpath',
])

const WRITE_TOKENS = new Set([
  'sed', 'tee', 'cp', 'mv', 'mkdir', 'rm', 'touch',
  'chmod', 'chown', 'patch', 'install', 'ln',
])

const VERIFY_PATTERNS = [
  /^tsc\b/,
  /^npm\s+(test|run\s+test)/,
  /^npx\s+(vitest|jest)/,
  /^pnpm\s+(test|run\s+test)/,
  /^eslint\b/,
  /^prettier\b/,
  /^cargo\s+test\b/,
  /^pytest\b/,
  /^go\s+test\b/,
  /^make\s+test\b/,
  /^bun\s+test\b/,
]

/**
 * Classify a bash command string into a step category.
 *
 * Rules:
 * 1. Extract the first token (command name).
 * 2. Check verify patterns first (they are multi-word).
 * 3. Check write tokens (including redirect detection).
 * 4. Check read tokens.
 * 5. Default to 'read'.
 */
export function classifyCommand(command: string): StepCategory {
  const trimmed = command.trim()
  if (!trimmed) return 'read'

  // Verify patterns (checked against the whole command)
  for (const pattern of VERIFY_PATTERNS) {
    if (pattern.test(trimmed)) return 'verify'
  }

  // Redirect detection → write
  if (/(?:>>?|>\|)\s/.test(trimmed)) return 'write'

  // First token
  const firstToken = trimmed.split(/\s+/)[0]!

  // awk -i → write
  if (firstToken === 'awk' && /\s-i\b/.test(trimmed)) return 'write'

  if (WRITE_TOKENS.has(firstToken)) return 'write'
  if (READ_TOKENS.has(firstToken)) return 'read'

  return 'read'
}

/**
 * Classify a non-bash tool call by tool name.
 */
export function classifyToolName(toolName: string): StepCategory {
  const lower = toolName.toLowerCase()
  if (lower.includes('write') || lower.includes('edit') || lower.includes('create')) return 'write'
  if (lower.includes('test') || lower.includes('check') || lower.includes('lint')) return 'verify'
  return 'read'
}
