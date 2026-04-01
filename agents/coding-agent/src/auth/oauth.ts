import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import * as readline from 'node:readline/promises'
import {
  getOAuthApiKey,
  getOAuthProvider,
  type OAuthCredentials,
} from '@mariozechner/pi-ai/oauth'

const CREDENTIALS_PATH = join(homedir(), '.codelord', 'credentials.json')

type StoredOAuthCredentials = Record<string, OAuthCredentials>

function loadCredentials(): StoredOAuthCredentials {
  try {
    const raw = readFileSync(CREDENTIALS_PATH, 'utf-8')
    return JSON.parse(raw) as StoredOAuthCredentials
  } catch {
    return {}
  }
}

function saveCredentials(credentials: StoredOAuthCredentials): void {
  mkdirSync(dirname(CREDENTIALS_PATH), { recursive: true })
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2))
}

export function isOAuthProvider(provider: string): boolean {
  return getOAuthProvider(provider) !== undefined
}

export async function resolveOAuthApiKey(provider: string): Promise<string> {
  const oauthProvider = getOAuthProvider(provider)
  if (!oauthProvider) {
    throw new Error(`Unknown OAuth provider: ${provider}`)
  }

  const storedCredentials = loadCredentials()
  const existing = await getOAuthApiKey(provider, storedCredentials)

  if (existing) {
    storedCredentials[provider] = existing.newCredentials
    saveCredentials(storedCredentials)
    return existing.apiKey
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  try {
    const credentials = await oauthProvider.login({
      onAuth: (info) => {
        console.log(`\nOpen this URL in your browser:\n${info.url}\n`)
        if (info.instructions) {
          console.log(info.instructions)
          console.log()
        }
      },
      onPrompt: async (prompt) => {
        const suffix = prompt.placeholder ? ` (${prompt.placeholder})` : ''
        return (await rl.question(`${prompt.message}${suffix}: `)).trim()
      },
    })

    storedCredentials[provider] = credentials
    saveCredentials(storedCredentials)

    const resolved = await getOAuthApiKey(provider, storedCredentials)
    if (!resolved) {
      throw new Error(`OAuth login succeeded, but no API key could be resolved for ${provider}`)
    }

    storedCredentials[provider] = resolved.newCredentials
    saveCredentials(storedCredentials)
    return resolved.apiKey
  } finally {
    rl.close()
  }
}
