import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { parse } from 'smol-toml'

// ---------------------------------------------------------------------------
// TOML config file reader
// ---------------------------------------------------------------------------

const CONFIG_PATH = join(homedir(), '.codelord', 'config.toml')

/**
 * Read and parse ~/.codelord/config.toml.
 * Returns an empty object if the file does not exist.
 * Throws on malformed TOML.
 */
export function readTomlConfig(path: string = CONFIG_PATH): Record<string, unknown> {
  let raw: string
  try {
    raw = readFileSync(path, 'utf-8')
  } catch {
    // File doesn't exist or is unreadable — not an error
    return {}
  }

  return parse(raw) as Record<string, unknown>
}
