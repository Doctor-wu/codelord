import fs from 'node:fs/promises'
import path from 'node:path'

import type { EvalResult } from './types.js'

export async function writeResult(result: EvalResult, outputPath: string): Promise<void> {
  const resolvedPath = path.resolve(outputPath)
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true })
  await fs.writeFile(resolvedPath, JSON.stringify(result, null, 2))

  printSummary(result, resolvedPath)
}

export function exitWithResult(result: EvalResult): never {
  const exitCode = resolveExitCode(result)
  process.exit(exitCode)
}

function resolveExitCode(result: EvalResult): number {
  if (result.errors?.length) return 2
  return result.cases.every((caseResult) => caseResult.passed) ? 0 : 1
}

function printSummary(result: EvalResult, outputPath: string): void {
  const metrics = Object.entries(result.metrics)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')

  console.log(
    `[${result.benchmark}] model=${result.model} provider=${result.provider} reasoning=${result.reasoningLevel} mode=${result.config.mode} cases=${result.cases.length} ${metrics} durationMs=${result.durationMs} timestamp=${result.timestamp}`,
  )
  console.log(`Results written to ${outputPath}`)
  console.log('| id | passed | durationMs | error |')
  console.log('| --- | --- | --- | --- |')

  for (const caseResult of result.cases) {
    console.log(
      `| ${caseResult.id} | ${caseResult.passed ? 'PASS' : 'FAIL'} | ${caseResult.durationMs} | ${caseResult.error ?? ''} |`,
    )
  }

  if (result.errors?.length) {
    console.log('Run errors:')
    for (const error of result.errors) {
      console.log(`- ${error.type}: ${error.message}${error.caseId ? ` (case: ${error.caseId})` : ''}`)
    }
  }
}
