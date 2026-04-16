import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import { resolveCodelordHome } from './paths.js'

function defaultConfigPath(): string {
  return join(resolveCodelordHome(), 'config.toml')
}

/**
 * Read and parse ~/.codelord/config.toml.
 * Returns an empty object if the file does not exist.
 * Throws on malformed TOML.
 */
export function readTomlConfig(path: string = defaultConfigPath()): Record<string, unknown> {
  let raw: string
  try {
    raw = readFileSync(path, 'utf-8')
  } catch {
    // File doesn't exist or is unreadable -- not an error
    return {}
  }

  return parse(raw) as Record<string, unknown>
}
