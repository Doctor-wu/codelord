// ---------------------------------------------------------------------------
// Bash command → StepCategory classification
// ---------------------------------------------------------------------------

import type { ToolCallState } from './state.js'
import type { StepCategory } from './theme.js'

type ToolStepCategory = Exclude<StepCategory, 'text'>

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

function splitCommandSegments(command: string): string[] {
  return command
    .split(/\s*(?:&&|\|\||[;|])\s*/g)
    .map((segment) => segment.trim())
    .filter(Boolean)
}

function extractCommandWords(segment: string): string[] {
  return segment.match(/[A-Za-z_][\w-]*/g) ?? []
}

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
export function classifyCommand(command: string): ToolStepCategory {
  const trimmed = command.trim()
  if (!trimmed) return 'read'

  const segments = splitCommandSegments(trimmed)
  let sawVerify = false
  let sawRead = false

  for (const segment of segments) {
    for (const pattern of VERIFY_PATTERNS) {
      if (pattern.test(segment)) {
        sawVerify = true
      }
    }

    if (/(?:>>?|>\|)\s/.test(segment)) return 'write'

    const commandWords = extractCommandWords(segment)
    if (commandWords.includes('awk') && /\s-i\b/.test(segment)) return 'write'

    if (commandWords.some((word) => WRITE_TOKENS.has(word))) return 'write'
    if (commandWords.some((word) => READ_TOKENS.has(word))) sawRead = true
  }

  if (sawVerify) return 'verify'
  if (sawRead) return 'read'

  return 'read'
}

/**
 * Classify a non-bash tool call by tool name.
 */
export function classifyToolName(toolName: string): ToolStepCategory {
  const lower = toolName.toLowerCase()
  if (lower.includes('write') || lower.includes('edit') || lower.includes('create')) return 'write'
  if (lower.includes('test') || lower.includes('check') || lower.includes('lint')) return 'verify'
  return 'read'
}

export function classifyToolCall(
  toolCall: Pick<ToolCallState, 'name' | 'command' | 'isError'>,
): ToolStepCategory {
  if (toolCall.isError) return 'error'

  return toolCall.name === 'bash'
    ? classifyCommand(toolCall.command)
    : classifyToolName(toolCall.name)
}
