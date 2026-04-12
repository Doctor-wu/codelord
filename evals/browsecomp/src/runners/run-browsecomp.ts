import path from 'node:path'
import fs from 'node:fs/promises'

import { loadConfig } from '@codelord/config'
import { runHeadless, resolveModel, resolveApiKey } from '@codelord/coding-agent'

import type { BrowseCompResult, BrowseCompSummary } from '../types.js'
import { loadDataset } from '../dataset.js'
import { gradeAnswer } from '../grader.js'

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
  const opts = parseArgs(process.argv)
  const dataDir = opts.dataDir
  const resultsDir = path.join(dataDir, 'results')
  await fs.mkdir(resultsDir, { recursive: true })

  // Load config & model — use low reasoning for BrowseComp to avoid proxy timeouts
  const config = loadConfig()
  config.reasoningLevel = 'low'
  const model = resolveModel(config)
  const apiKey = await resolveApiKey(config)

  // Grader model: use separate config if provided, otherwise same as agent
  const graderConfig = { ...config }
  if (process.env.GRADER_PROVIDER) graderConfig.provider = process.env.GRADER_PROVIDER
  if (process.env.GRADER_MODEL) graderConfig.model = process.env.GRADER_MODEL
  if (process.env.GRADER_API_KEY) graderConfig.apiKey = process.env.GRADER_API_KEY
  if (process.env.GRADER_BASE_URL) graderConfig.baseUrl = process.env.GRADER_BASE_URL
  const graderModel = resolveModel(graderConfig)
  const graderApiKey = await resolveApiKey(graderConfig)

  // Warn if TAVILY_API_KEY is missing
  if (!process.env.TAVILY_API_KEY) {
    console.warn('WARNING: TAVILY_API_KEY not set — web_search will be unavailable, agent can only use web_fetch.\n')
  }

  // Load dataset
  let entries = await loadDataset(dataDir)

  // Apply offset and limit
  if (opts.offset) entries = entries.slice(opts.offset)
  if (opts.limit != null) entries = entries.slice(0, opts.limit)

  const total = entries.length
  if (total === 0) {
    console.log('No questions to solve (check --offset/--limit).')
    return
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
      question: entry.question.slice(0, 200), // preview only, avoid leaking full question
      referenceAnswer: '', // don't store to avoid leaking
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
      const r = await runHeadless({ model, apiKey, config, prompt })

      result.agentResponse = r.text
      result.traceId = r.trace?.runId ?? ''
      result.durationMs = Date.now() - start

      // Extract answer and confidence from agent response
      const extracted = extractAnswer(r.text)
      result.extractedAnswer = extracted.answer
      result.confidence = extracted.confidence

      // Grade
      if (!opts.skipGrade) {
        console.log(`${prefix} Grading...`)
        const gradeResult = await gradeAnswer({
          question: entry.question,
          correctAnswer: entry.answer,
          agentResponse: r.text,
          graderModel,
          graderApiKey,
        })
        result.grade = gradeResult.grade
        result.graderReasoning = gradeResult.reasoning
        result.extractedAnswer = gradeResult.extractedAnswer // prefer grader's extraction
      } else {
        result.grade = 'INCORRECT' // placeholder when skipping grade
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

  // --- Write outputs ---
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outputPath = opts.output ?? path.join(resultsDir, `browsecomp-${timestamp}.json`)

  const correctCount = results.filter(r => r.grade === 'CORRECT').length
  const incorrectCount = results.filter(r => r.grade === 'INCORRECT').length
  const errorCount = results.filter(r => r.grade === 'ERROR').length
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0)
  const totalConfidence = results.reduce((sum, r) => sum + r.confidence, 0)

  const summary: BrowseCompSummary = {
    timestamp: new Date().toISOString(),
    model: config.model,
    totalQuestions: total,
    correctCount,
    incorrectCount,
    errorCount,
    accuracy: total > 0 ? correctCount / total : 0,
    avgDurationMs: total > 0 ? totalDuration / total : 0,
    avgConfidence: total > 0 ? totalConfidence / total : 0,
    results,
  }

  await fs.writeFile(outputPath, JSON.stringify(summary, null, 2))

  // Print summary
  const pctCorrect = total > 0 ? ((correctCount / total) * 100).toFixed(1) : '0.0'
  const avgDur = total > 0 ? (totalDuration / total / 1000).toFixed(1) : '0.0'
  const avgConf = total > 0 ? (totalConfidence / total).toFixed(1) : '0.0'

  console.log(`\n=== BrowseComp Results ===`)
  console.log(`Total: ${total} | Correct: ${correctCount} (${pctCorrect}%) | Incorrect: ${incorrectCount} | Errors: ${errorCount}`)
  console.log(`Avg duration: ${avgDur}s | Avg confidence: ${avgConf}%`)
  console.log(`Results written to ${outputPath}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
