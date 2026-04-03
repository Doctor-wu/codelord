// ---------------------------------------------------------------------------
// TraceStore — writes trace JSON files to ~/.codelord/traces/
// ---------------------------------------------------------------------------

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { TraceRun } from '@agent/core'

const TRACES_DIR = join(homedir(), '.codelord', 'traces')

export class TraceStore {
  private readonly baseDir: string

  constructor(baseDir = TRACES_DIR) {
    this.baseDir = baseDir
  }

  save(trace: TraceRun): void {
    mkdirSync(this.baseDir, { recursive: true })
    const file = join(this.baseDir, `${trace.runId}.json`)
    writeFileSync(file, JSON.stringify(trace, null, 2), 'utf-8')
  }
}
