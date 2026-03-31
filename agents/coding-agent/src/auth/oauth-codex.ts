import { loginOpenAICodex } from '@mariozechner/pi-ai/oauth'
import type { OAuthCredentials } from '@mariozechner/pi-ai'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import * as readline from 'node:readline/promises'

// ---------------------------------------------------------------------------
// OpenAI Codex OAuth strategy
// ---------------------------------------------------------------------------

const CREDENTIALS_PATH = join(homedir(), '.codelord', 'credentials.json')

function loadCredentials(): OAuthCredentials | null {
  try {
    const raw = readFileSync(CREDENTIALS_PATH, 'utf-8')
    return JSON.parse(raw) as OAuthCredentials
  } catch {
    return null
  }
}

function saveCredentials(creds: OAuthCredentials): void {
  mkdirSync(dirname(CREDENTIALS_PATH), { recursive: true })
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2))
}

/**
 * Resolve API key via OpenAI Codex OAuth flow.
 * Uses cached credentials with refresh, falls back to interactive login.
 */
export async function resolveCodexOAuth(): Promise<string> {
  const saved = loadCredentials()

  // Valid cached token
  if (saved && saved.expires > Date.now() + 60_000) {
    return saved.access
  }

  // Try refresh
  if (saved?.refresh) {
    const { refreshOpenAICodexToken } = await import('@mariozechner/pi-ai/oauth')
    try {
      const refreshed = await refreshOpenAICodexToken(saved.refresh)
      saveCredentials(refreshed)
      return refreshed.access
    } catch {
      // fall through to full login
    }
  }

  // Interactive login
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const credentials = await loginOpenAICodex({
    onAuth: (info) => {
      console.log(`\n  Open this URL in your browser:\n  ${info.url}\n`)
      if (info.instructions) console.log(`  ${info.instructions}`)
    },
    onPrompt: async (prompt) => {
      const answer = await rl.question(`${prompt.message} `)
      return answer
    },
  })
  rl.close()
  saveCredentials(credentials)
  return credentials.access
}
