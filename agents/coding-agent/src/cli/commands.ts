// ---------------------------------------------------------------------------
// Command Registry — structured, discoverable operator commands
// ---------------------------------------------------------------------------

import type { SessionMode } from '../renderer/ink/InputComposer.js'

export interface CommandDefinition {
  name: string
  description: string
  usage?: string
  /** Which session modes this command is available in */
  availableIn: SessionMode[]
  /** Whether the command can be used while the agent is running */
  availableWhileRunning: boolean
}

const COMMANDS: CommandDefinition[] = [
  {
    name: '/help',
    description: 'Show available commands',
    availableIn: ['idle', 'running', 'waiting_answer', 'error'],
    availableWhileRunning: true,
  },
  {
    name: '/exit',
    description: 'Quit the session',
    availableIn: ['idle', 'error'],
    availableWhileRunning: false,
  },
  {
    name: '/undo',
    description: 'Revert last file changes',
    availableIn: ['idle', 'error'],
    availableWhileRunning: false,
  },
  {
    name: '/reasoning',
    description: 'Show or set reasoning level',
    usage: '/reasoning [off|minimal|low|medium|high|xhigh]',
    availableIn: ['idle', 'running', 'waiting_answer', 'error'],
    availableWhileRunning: true,
  },
]

/** Return commands available in the given mode/running state. */
export function getAvailableCommands(mode: SessionMode, isRunning: boolean): CommandDefinition[] {
  return COMMANDS.filter((cmd) => cmd.availableIn.includes(mode) && (isRunning ? cmd.availableWhileRunning : true))
}

/** Check if input is a registered command (exact match on the command name part). */
export function isRegisteredCommand(input: string): boolean {
  const cmdPart = input.trim().toLowerCase().split(/\s/)[0]
  return COMMANDS.some((cmd) => cmd.name === cmdPart)
}

/** Get all commands with availability flag for the current state. */
export function getAllCommandsWithAvailability(
  mode: SessionMode,
  isRunning: boolean,
): (CommandDefinition & { available: boolean })[] {
  return COMMANDS.map((cmd) => ({
    ...cmd,
    available: cmd.availableIn.includes(mode) && (isRunning ? cmd.availableWhileRunning : true),
  }))
}

/** Prefix-match ALL commands (with availability flag) for suggestion display. */
export function matchAllCommandSuggestions(
  input: string,
  mode: SessionMode,
  isRunning: boolean,
): (CommandDefinition & { available: boolean })[] {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed.startsWith('/')) return []
  const cmdPart = trimmed.split(/\s/)[0]
  return getAllCommandsWithAvailability(mode, isRunning).filter((cmd) => cmd.name.startsWith(cmdPart))
}

/** Format help text for command_feedback lifecycle event. */
export function formatHelpText(mode: SessionMode, isRunning: boolean): string {
  const cmds = getAllCommandsWithAvailability(mode, isRunning)
  const maxLen = Math.max(...cmds.map((c) => c.name.length))
  const lines = ['Available commands:', '']
  for (const cmd of cmds) {
    const pad = ' '.repeat(maxLen - cmd.name.length + 2)
    const suffix = cmd.available ? '' : '  [not available now]'
    lines.push(`  ${cmd.name}${pad}${cmd.description}${suffix}`)
  }
  return lines.join('\n')
}
