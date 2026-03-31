export interface CliFlags {
  plain?: boolean
  model?: string
  provider?: string
  maxSteps?: number
}

export type ParsedArgs =
  | { command: 'run'; message: string; flags: CliFlags }
  | { command: 'init' }
  | { command: 'config'; flags: CliFlags }
  | { command: 'help' }
  | { command: 'version' }

function hasFlags(flags: CliFlags): boolean {
  return Object.keys(flags).length > 0
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index]
  if (!value) {
    throw new Error(`Missing value for ${option}`)
  }
  return value
}

export function parseArgs(argv: string[]): ParsedArgs {
  const flags: CliFlags = {}
  const positionals: string[] = []
  let help = false
  let version = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    switch (arg) {
      case '--plain':
        flags.plain = true
        break
      case '--model':
        flags.model = requireValue(argv, index + 1, '--model')
        index += 1
        break
      case '--provider':
        flags.provider = requireValue(argv, index + 1, '--provider')
        index += 1
        break
      case '--max-steps': {
        const raw = requireValue(argv, index + 1, '--max-steps')
        const value = Number(raw)
        if (!Number.isInteger(value) || value <= 0) {
          throw new Error(`Invalid value for --max-steps: ${raw}`)
        }
        flags.maxSteps = value
        index += 1
        break
      }
      case '--help':
      case '-h':
        help = true
        break
      case '--version':
      case '-v':
        version = true
        break
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown option: ${arg}`)
        }
        positionals.push(arg)
    }
  }

  if (help) return { command: 'help' }
  if (version) return { command: 'version' }
  if (positionals.length === 0) return { command: 'help' }

  const [command, ...rest] = positionals

  if (command === 'init') {
    if (rest.length > 0) {
      throw new Error('The init command does not accept positional arguments.')
    }
    if (hasFlags(flags)) {
      throw new Error('The init command does not accept global flags.')
    }
    return { command: 'init' }
  }

  if (command === 'config') {
    if (rest.length > 0) {
      throw new Error('The config command does not accept positional arguments.')
    }
    return { command: 'config', flags }
  }

  if (command === 'help') {
    if (rest.length > 0 || hasFlags(flags)) {
      throw new Error('The help command does not accept additional arguments.')
    }
    return { command: 'help' }
  }

  if (command === 'version') {
    if (rest.length > 0 || hasFlags(flags)) {
      throw new Error('The version command does not accept additional arguments.')
    }
    return { command: 'version' }
  }

  return {
    command: 'run',
    message: positionals.join(' '),
    flags,
  }
}
