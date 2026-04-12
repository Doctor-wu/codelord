import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { BrowseCompEntry } from './types.js'

const DATASET_URL = 'https://openaipublic.blob.core.windows.net/simple-evals/browse_comp_test_set.csv'

/**
 * XOR decrypt using canary-derived key (same as OpenAI's simple-evals utils.py).
 * The canary is hashed with SHA-256 to produce the key, then XOR'd with the
 * base64-decoded ciphertext.
 */
function decrypt(encrypted: string, canary: string): string {
  const key = createHash('sha256').update(canary).digest()
  const ciphertext = Buffer.from(encrypted, 'base64')
  const decrypted = Buffer.alloc(ciphertext.length)
  for (let i = 0; i < ciphertext.length; i++) {
    decrypted[i] = ciphertext[i]! ^ key[i % key.length]!
  }
  return decrypted.toString('utf-8')
}

/**
 * Parse a simple CSV line, handling quoted fields with commas inside.
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"'
        i++ // skip escaped quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}
/**
 * Load BrowseComp dataset. Downloads and caches locally.
 */
export async function loadDataset(cacheDir: string): Promise<BrowseCompEntry[]> {
  const cachePath = path.join(cacheDir, 'browsecomp-dataset.json')

  // Return cached if available
  try {
    const cached = await fs.readFile(cachePath, 'utf-8')
    return JSON.parse(cached) as BrowseCompEntry[]
  } catch {
    // Not cached, download
  }

  console.log('Downloading BrowseComp dataset...')
  const resp = await fetch(DATASET_URL)
  if (!resp.ok) throw new Error(`Failed to download dataset: ${resp.status} ${resp.statusText}`)
  const csv = await resp.text()

  const lines = csv.split('\n').filter(l => l.trim())
  const header = parseCSVLine(lines[0]!)
  // Dataset uses 'problem' as the question column name
  const qIdx = header.indexOf('problem')
  const aIdx = header.indexOf('answer')
  const cIdx = header.indexOf('canary')

  if (qIdx < 0 || aIdx < 0 || cIdx < 0) {
    throw new Error(`Unexpected CSV headers: ${header.join(', ')}. Expected problem, answer, canary.`)
  }

  const entries: BrowseCompEntry[] = []
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]!)
    if (fields.length <= Math.max(qIdx, aIdx, cIdx)) continue

    const canary = fields[cIdx]!.trim()
    const encryptedQ = fields[qIdx]!.trim()
    const encryptedA = fields[aIdx]!.trim()

    try {
      entries.push({
        question: decrypt(encryptedQ, canary),
        answer: decrypt(encryptedA, canary),
        canary,
      })
    } catch (err) {
      console.warn(`  Skipping entry ${i}: decryption failed — ${err}`)
    }
  }

  // Cache locally
  await fs.mkdir(path.dirname(cachePath), { recursive: true })
  await fs.writeFile(cachePath, JSON.stringify(entries, null, 2))
  console.log(`Dataset cached to ${cachePath} (${entries.length} entries)`)

  return entries
}
