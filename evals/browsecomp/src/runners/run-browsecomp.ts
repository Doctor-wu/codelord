import path from 'node:path'
import fs from 'node:fs/promises'

import { loadConfig } from '@codelord/config'
import { runHeadless, resolveModel, resolveApiKey } from '@codelord/coding-agent'
import { exitWithResult, writeResult } from '@codelord/evals-shared'

import type { BrowseCompResult } from '../types.js'
import { loadDataset } from '../dataset.js'
import { gradeAnswer } from '../grader.js'
import {
  buildBrowseCompEvalResult,
  buildBrowseCompRuntimeErrorResult,
  registerBrowseCompRenderer,
} from '../eval-result.js'

// --- CLI argument parsing ---------------------------------------------------

function parseArgs(argv: string[]) {
  const args = argv.slice(2)
  let dataDir = './data'
  let limit: number | undefined
  let offset: number | undefined
  let output: string | undefined
  let skipGrade = false

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--data-dir':
        dataDir = args[++i]!
        break
      case '--limit':
        limit = Number(args[++i])
        break
      case '--offset':
        offset = Number(args[++i])
        break
      case '--output':
        output = args[++i]!
        break
      case '--skip-grade':
        skipGrade = true
        break
    }
  }

  return { dataDir: path.resolve(dataDir), limit, offset, output, skipGrade }
}

// --- Prompt & extraction ----------------------------------------------------

function buildPrompt(question: string): string {
  return `You are a web research agent. Your task is to find the answer to a challenging question by searching the web.

## Question
${question}

## Instructions
- You MUST use the web_search tool to search for information. Do NOT use bash curl/wget.
- You MUST use the web_fetch tool to read web pages. Do NOT use bash curl/wget.
- Be persistent — the answer may require searching through many sources
- The answer is a short, specific fact (a name, number, date, title, etc.)
- Try multiple search strategies if initial searches don't find the answer
- After each search, analyze the results and decide whether to search more or fetch specific pages

## Response Format
Your response MUST end with these three lines:
Explanation: {your reasoning for arriving at the answer}
Exact Answer: {your concise, final answer}
Confidence: {0-100}%`
}

function extractAnswer(response: string): { answer: string; confidence: number } {
  const answerMatch = response.match(/Exact Answer:\s*(.+)/i)
  const confidenceMatch = response.match(/Confidence:\s*(\d+)/i)

  return {
    answer: answerMatch?.[1]?.trim() ?? '',
    confidence: confidenceMatch ? Number(confidenceMatch[1]) : 0,
  }
}

// --- Main -------------------------------------------------------------------

async function main() {
  registerBrowseCompRenderer()

  const startTime = Date.now()
  const opts = parseArgs(process.argv)
  const dataDir = opts.dataDir
  const resultsDir = path.join(dataDir, 'results')
  await fs.mkdir(resultsDir, { recursive: true })
  const outputPath =
    opts.output ?? path.join(resultsDir, `browsecomp-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)

  let modelId: string | undefined
  let providerId: string | undefined
  let reasoningLevel: string | undefined

  try {
    const config = loadConfig()
    config.reasoningLevel = 'low'
    modelId = config.model
    providerId = config.provider
    reasoningLevel = config.reasoningLevel
    const model = resolveModel(config)
    const apiKey = await resolveApiKey(config)

    const graderConfig = { ...config }
    if (process.env.GRADER_PROVIDER) graderConfig.provider = process.env.GRADER_PROVIDER
    if (process.env.GRADER_MODEL) graderConfig.model = process.env.GRADER_MODEL
    if (process.env.GRADER_API_KEY) graderConfig.apiKey = process.env.GRADER_API_KEY
    if (process.env.GRADER_BASE_URL) graderConfig.baseUrl = process.env.GRADER_BASE_URL
    const graderModel = resolveModel(graderConfig)
    const graderApiKey = await resolveApiKey(graderConfig)

    if (!process.env.TAVILY_API_KEY) {
      console.warn('WARNING: TAVILY_API_KEY not set — web_search will be unavailable, agent can only use web_fetch.\n')
    }

    let entries = await loadDataset(dataDir)
    if (opts.offset) entries = entries.slice(opts.offset)
    if (opts.limit !== undefined) entries = entries.slice(0, opts.limit)

    const total = entries.length
    if (total === 0) {
      console.log('No questions to solve (check --offset/--limit).')
      const evalResult = buildBrowseCompEvalResult([], {
        model: config.model,
        provider: config.provider,
        reasoningLevel: config.reasoningLevel,
        limit: opts.limit,
        offset: opts.offset,
        skipGrade: opts.skipGrade,
      })
      await writeResult(evalResult, outputPath)
      exitWithResult(evalResult)
    }

    console.log(`Running BrowseComp: ${total} questions\n`)

    const results: BrowseCompResult[] = []

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!
      const globalIdx = (opts.offset ?? 0) + i
      const prefix = `[${i + 1}/${total}]`
      const start = Date.now()

      const result: BrowseCompResult = {
        id: globalIdx,
        question: entry.question.slice(0, 200),
        referenceAnswer: '',
        agentResponse: '',
        extractedAnswer: '',
        confidence: 0,
        grade: 'ERROR',
        graderReasoning: '',
        durationMs: 0,
        traceId: '',
      }

      try {
        const prompt = buildPrompt(entry.question)
        const questionPreview = entry.question.slice(0, 80).replace(/\n/g, ' ')
        console.log(`${prefix} Solving: "${questionPreview}..."`)
        const runResult = await runHeadless({ model, apiKey, config, prompt })

        result.agentResponse = runResult.text
        result.traceId = runResult.trace?.runId ?? ''
        result.durationMs = Date.now() - start

        const extracted = extractAnswer(runResult.text)
        result.extractedAnswer = extracted.answer
        result.confidence = extracted.confidence

        if (!opts.skipGrade) {
          console.log(`${prefix} Grading...`)
          const gradeResult = await gradeAnswer({
            question: entry.question,
            correctAnswer: entry.answer,
            agentResponse: runResult.text,
            graderModel,
            graderApiKey,
          })
          result.grade = gradeResult.grade
          result.graderReasoning = gradeResult.reasoning
          result.extractedAnswer = gradeResult.extractedAnswer
        } else {
          result.grade = 'INCORRECT'
        }
      } catch (err) {
        result.durationMs = Date.now() - start
        result.error = err instanceof Error ? err.message : String(err)
      }

      results.push(result)

      const dur = (result.durationMs / 1000).toFixed(1)
      const answerPreview = result.extractedAnswer.slice(0, 40) || '(empty)'
      console.log(`${prefix} #${globalIdx}: ${result.grade} [${answerPreview}] (${dur}s)`)
    }

    const evalResult = buildBrowseCompEvalResult(results, {
      model: config.model,
      provider: config.provider,
      reasoningLevel: config.reasoningLevel,
      limit: opts.limit,
      offset: opts.offset,
      skipGrade: opts.skipGrade,
    })

    await writeResult(evalResult, outputPath)
    exitWithResult(evalResult)
  } catch (error) {
    const runtimeErrorResult = buildBrowseCompRuntimeErrorResult(error, {
      model: modelId,
      provider: providerId,
      reasoningLevel,
      limit: opts.limit,
      offset: opts.offset,
      skipGrade: opts.skipGrade,
      durationMs: Date.now() - startTime,
    })

    await writeResult(runtimeErrorResult, outputPath)
    exitWithResult(runtimeErrorResult)
  }
}

void main()
