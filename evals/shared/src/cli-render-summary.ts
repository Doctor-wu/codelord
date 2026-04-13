import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { renderSummaryMarkdown } from './summary-renderer.js'
import type { EvalResult } from './types.js'

interface CliArgs {
  inputPath: string
  outputPath?: string
}

async function main(): Promise<void> {
  await registerAllRenderers()

  const args = parseArgs(process.argv.slice(2))
  const result = JSON.parse(await fs.readFile(args.inputPath, 'utf8')) as EvalResult
  const markdown = renderSummaryMarkdown(result)

  if (args.outputPath) {
    const resolvedOutputPath = path.resolve(args.outputPath)
    await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true })
    await fs.writeFile(resolvedOutputPath, markdown)
    return
  }

  process.stdout.write(markdown)
}

async function registerAllRenderers(): Promise<void> {
  const [
    polyglotModule,
    sweBenchModule,
    browseCompModule,
    terminalBenchModule,
  ] = await Promise.all([
    import(new URL('../../polyglot/src/eval-result.ts', import.meta.url).href),
    import(new URL('../../swe-bench/src/eval-result.ts', import.meta.url).href),
    import(new URL('../../browsecomp/src/eval-result.ts', import.meta.url).href),
    import(new URL('../../terminal-bench/src/eval-result.ts', import.meta.url).href),
  ])

  polyglotModule.registerPolyglotRenderer()
  sweBenchModule.registerSWEBenchRenderer()
  browseCompModule.registerBrowseCompRenderer()
  terminalBenchModule.registerTerminalBenchRenderer()
}

function parseArgs(argv: string[]): CliArgs {
  let inputPath: string | undefined
  let outputPath: string | undefined

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--input') {
      inputPath = argv[index + 1]
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

  if (!inputPath) {
    throw new Error('Missing required argument: --input <path>')
  }

  return {
    inputPath: path.resolve(inputPath),
    outputPath: outputPath ? path.resolve(outputPath) : undefined,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
}
