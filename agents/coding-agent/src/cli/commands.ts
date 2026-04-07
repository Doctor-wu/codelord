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
  return COMMANDS.filter(cmd =>
    cmd.availableIn.includes(mode) && (isRunning ? cmd.availableWhileRunning : true),
  )
}

/** Prefix-match commands against user input starting with `/`. */
export function matchCommandSuggestions(input: string, mode: SessionMode, isRunning: boolean): CommandDefinition[] {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed.startsWith('/')) return []
  // Extract just the command part (before any space/args)
  const cmdPart = trimmed.split(/\s/)[0]
  return getAvailableCommands(mode, isRunning).filter(cmd =>
    cmd.name.startsWith(cmdPart),
  )
}

/** Check if input is a registered command (exact match on the command name part). */
export function isRegisteredCommand(input: string): boolean {
  const cmdPart = input.trim().toLowerCase().split(/\s/)[0]
  return COMMANDS.some(cmd => cmd.name === cmdPart)
}
