import { describe, expect, it } from 'vitest'
import { parseArgs } from '../src/cli/parse-args.js'

describe('parseArgs', () => {
  it('parses a single-shot run message', () => {
    expect(parseArgs(['fix the failing test'])).toEqual({
      command: 'run',
      message: 'fix the failing test',
      flags: {},
    })
  })

  it('parses run flags and joins positional message parts', () => {
    expect(parseArgs([
      '--plain',
      '--model',
      'gpt-5.4',
      '--provider',
      'openai',
      '--max-steps',
      '12',
      'fix',
      'the',
      'bug',
    ])).toEqual({
      command: 'run',
      message: 'fix the bug',
      flags: {
        plain: true,
        model: 'gpt-5.4',
        provider: 'openai',
        maxSteps: 12,
      },
    })
  })

  it('parses init command', () => {
    expect(parseArgs(['init'])).toEqual({ command: 'init' })
  })

  it('parses config command with override flags', () => {
    expect(parseArgs(['config', '--provider', 'openai'])).toEqual({
      command: 'config',
      flags: { provider: 'openai' },
    })
  })

  it('parses help and version flags', () => {
    expect(parseArgs(['--help'])).toEqual({ command: 'help' })
    expect(parseArgs(['-v'])).toEqual({ command: 'version' })
  })

  it('throws on unknown flags', () => {
    expect(() => parseArgs(['--wat'])).toThrow('Unknown option: --wat')
  })

  it('throws when a flag value is missing', () => {
    expect(() => parseArgs(['--model'])).toThrow('Missing value for --model')
  })

  it('throws when max steps is invalid', () => {
    expect(() => parseArgs(['--max-steps', 'abc', 'fix bug'])).toThrow(
      'Invalid value for --max-steps: abc',
    )
  })

  it('throws when init receives unsupported flags', () => {
    expect(() => parseArgs(['init', '--plain'])).toThrow(
      'The init command does not accept global flags.',
    )
  })
})
