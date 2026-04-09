import fs from 'node:fs/promises'
import path from 'node:path'
import type { SWEBenchInstance } from './types.js'

const DATASET_URL = 'https://datasets-server.huggingface.co/rows'
const DATASET_NAME = 'princeton-nlp/SWE-bench_Verified'
const CONFIG = 'default'
const SPLIT = 'test'
const PAGE_SIZE = 100 // HuggingFace API max per request

/**
 * Load the SWE-bench Verified dataset.
 * Downloads from HuggingFace on first call, caches to local file.
 */
export async function loadDataset(cacheDir: string): Promise<SWEBenchInstance[]> {
  const cachePath = path.join(cacheDir, 'swe-bench-verified.json')

  // Return cached if available
  try {
    const cached = await fs.readFile(cachePath, 'utf-8')
    return JSON.parse(cached) as SWEBenchInstance[]
  } catch {
    // Not cached, download
  }

  console.log('Downloading SWE-bench Verified dataset from HuggingFace...')
  const instances: SWEBenchInstance[] = []
  let offset = 0

  while (true) {
    const url = `${DATASET_URL}?dataset=${encodeURIComponent(DATASET_NAME)}&config=${CONFIG}&split=${SPLIT}&offset=${offset}&length=${PAGE_SIZE}`
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`HuggingFace API error: ${resp.status} ${resp.statusText}`)
    const data = (await resp.json()) as { rows: Array<{ row: SWEBenchInstance }> }
    if (data.rows.length === 0) break
    for (const { row } of data.rows) {
      instances.push(row)
    }
    offset += PAGE_SIZE
    console.log(`  Downloaded ${instances.length} instances...`)
    if (data.rows.length < PAGE_SIZE) break
  }

  // Cache locally
  await fs.mkdir(path.dirname(cachePath), { recursive: true })
  await fs.writeFile(cachePath, JSON.stringify(instances, null, 2))
  console.log(`Dataset cached to ${cachePath} (${instances.length} instances)`)

  return instances
}
