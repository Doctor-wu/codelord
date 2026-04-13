import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { exitWithResult, writeResult } from '@codelord/evals-shared'

import {
  buildTerminalBenchEvalResult,
  buildTerminalBenchRuntimeErrorResult,
  inferModelInfo,
  registerTerminalBenchRenderer,
  type HarborJobConfig,
  type HarborTrialResult,
} from './eval-result.js'

interface CliArgs {
  jobDir: string
  outputPath?: string
}

async function main(): Promise<void> {
  registerTerminalBenchRenderer()

  const startedAt = Date.now()
  const args = parseArgs(process.argv.slice(2))

  try {
    const jobDir = path.resolve(args.jobDir)
    const [jobConfig, trials] = await Promise.all([
      readJsonFile<HarborJobConfig>(path.join(jobDir, 'config.json')),
      loadTrialResults(jobDir),
    ])

    const modelInfo = inferModelInfo(jobConfig)
    const result = buildTerminalBenchEvalResult(trials, modelInfo)
    const outputPath = args.outputPath
      ? path.resolve(args.outputPath)
      : path.join(jobDir, 'eval-result.json')

    await writeResult(result, outputPath)
    exitWithResult(result)
  } catch (error) {
    const runtimeResult = buildTerminalBenchRuntimeErrorResult(error, {
      durationMs: Date.now() - startedAt,
    })
    const fallbackJobDir = args.jobDir ? path.resolve(args.jobDir) : process.cwd()
    const outputPath = args.outputPath
      ? path.resolve(args.outputPath)
      : path.join(fallbackJobDir, 'eval-result.json')

    await writeResult(runtimeResult, outputPath)
    exitWithResult(runtimeResult)
  }
}

export async function loadTrialResults(jobDir: string): Promise<HarborTrialResult[]> {
  const entries = await fs.readdir(jobDir, { withFileTypes: true })
  const trialDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()

  const trialResults = await Promise.all(
    trialDirs.map(async (dirName) => {
      const resultPath = path.join(jobDir, dirName, 'result.json')
      return readJsonFile<HarborTrialResult>(resultPath)
    }),
  )

  return trialResults
}

function parseArgs(argv: string[]): CliArgs {
  let jobDir: string | undefined
  let outputPath: string | undefined

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--job-dir') {
      jobDir = argv[index + 1]
      index += 1
      continue
    }

    if (arg === '--output') {
      outputPath = argv[index + 1]
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!jobDir) {
    throw new Error('Missing required argument: --job-dir <path>')
  }

  return { jobDir, outputPath }
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const contents = await fs.readFile(filePath, 'utf8')
  return JSON.parse(contents) as T
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
}
