import fs from 'node:fs/promises'
import path from 'node:path'
import { execSync } from 'node:child_process'

import type { ExerciseInfo } from '../../types.js'
import { findSolutionFiles, truncateOutput } from './utils.js'

const SUPPORTED_LANGUAGES = ['python', 'rust', 'go', 'javascript', 'cpp', 'java'] as const

/**
 * Return the shell command used to run tests for a given language.
 */
export function getTestCommand(language: string): string {
  switch (language) {
    case 'python':
      return 'python3 -m pytest *_test.py -v --tb=short --no-header -rN'
    case 'rust':
      return 'cargo test'
    case 'go':
      return 'go test -v ./...'
    case 'javascript':
      return 'npm test'
    case 'cpp':
      return 'mkdir -p build && cd build && cmake .. && make && ctest --output-on-failure'
    case 'java':
      return 'gradle test'
    default:
      throw new Error(`Unsupported language: ${language}`)
  }
}

/**
 * Scan the polyglot-benchmark directory for exercises.
 */
export async function scanExercises(benchmarkDir: string, languages?: string[]): Promise<ExerciseInfo[]> {
  const langs = languages ?? [...SUPPORTED_LANGUAGES]
  const exercises: ExerciseInfo[] = []

  for (const language of langs) {
    const practiceDir = path.join(benchmarkDir, language, 'exercises', 'practice')
    let entries: string[]
    try {
      entries = await fs.readdir(practiceDir)
    } catch {
      // Language directory doesn't exist — skip
      continue
    }
    for (const entry of entries) {
      const exerciseDir = path.join(practiceDir, entry)
      const stat = await fs.stat(exerciseDir)
      if (!stat.isDirectory()) continue

      const solutionFiles = await findSolutionFiles(exerciseDir, language)
      exercises.push({
        id: `${language}/${entry}`,
        language,
        exerciseName: entry,
        exerciseDir,
        solutionFiles,
        testCommand: getTestCommand(language),
      })
    }
  }

  return exercises
}

/**
 * Build the initial prompt for an exercise.
 */
export async function buildPrompt(exercise: ExerciseInfo): Promise<string> {
  const docsDir = path.join(exercise.exerciseDir, '.docs')
  const instructions = await fs.readFile(path.join(docsDir, 'instructions.md'), 'utf-8')

  let introduction: string | undefined
  try {
    introduction = await fs.readFile(path.join(docsDir, 'introduction.md'), 'utf-8')
  } catch {
    // No introduction file
  }

  const fileContents: string[] = []
  for (const relPath of exercise.solutionFiles) {
    const absPath = path.join(exercise.exerciseDir, relPath)
    const content = await fs.readFile(absPath, 'utf-8')
    fileContents.push(`### ${relPath}\n\`\`\`\n${content}\n\`\`\``)
  }

  const solutionList = exercise.solutionFiles.map((f) => `- ${f}`).join('\n')

  let prompt = `You are solving an Exercism coding exercise.

## Problem Description
${instructions}
`

  if (introduction) {
    prompt += `
## Introduction
${introduction}
`
  }

  prompt += `
## Files to Modify
You must modify the following file(s) to implement the solution:
${solutionList}

## Current File Content
${fileContents.join('\n\n')}

## Constraints
- Only modify the listed solution file(s)
- Do not modify test files
- Use only standard library features unless the project config specifies otherwise
- Preserve existing function/method/class signatures where they exist`

  return prompt
}

/**
 * Build a retry prompt that includes previous test failure output.
 */
export async function buildRetryPrompt(exercise: ExerciseInfo, testOutput: string): Promise<string> {
  const base = await buildPrompt(exercise)
  const truncated = truncateOutput(testOutput, 8000)

  return `${base}

## Previous Attempt Failed
The tests produced the following errors:
\`\`\`
${truncated}
\`\`\`
Please fix the solution based on these test errors.`
}

/**
 * Run the test command for an exercise and return pass/fail + output.
 */
export function runTest(exercise: ExerciseInfo): { passed: boolean; output: string } {
  try {
    const output = execSync(exercise.testCommand, {
      cwd: exercise.exerciseDir,
      timeout: 120_000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { passed: true, output: truncateOutput(output, 10_000) }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number }
    const combined = [e.stdout ?? '', e.stderr ?? ''].join('\n')
    return { passed: false, output: truncateOutput(combined, 10_000) }
  }
}

/**
 * Check that required tools for a language are available.
 * Returns null if OK, or an error message string if something is missing.
 */
export function checkLanguagePrereqs(language: string): string | null {
  const checks: Record<string, { command: string; errorHint: string }[]> = {
    python: [{ command: 'python3 -m pytest --version', errorHint: 'pytest not found. Install: pip3 install pytest' }],
    javascript: [{ command: 'npm --version', errorHint: 'npm not found. Install Node.js' }],
    rust: [{ command: 'cargo --version', errorHint: 'cargo not found. Install Rust: https://rustup.rs' }],
    go: [{ command: 'go version', errorHint: 'go not found. Install Go: https://go.dev/dl/' }],
    cpp: [{ command: 'cmake --version', errorHint: 'cmake not found. Install: brew install cmake' }],
    java: [{ command: 'gradle --version', errorHint: 'gradle not found. Install: brew install gradle' }],
  }

  const langChecks = checks[language]
  if (!langChecks) return null

  for (const check of langChecks) {
    try {
      execSync(check.command, { stdio: 'pipe', timeout: 10_000 })
    } catch {
      return check.errorHint
    }
  }
  return null
}
