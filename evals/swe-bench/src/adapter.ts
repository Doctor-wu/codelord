import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { SWEBenchInstance } from './types.js'

/**
 * Prepare a repo checkout for a single SWE-bench instance.
 * Clones the repo if not already present, then checks out the base commit.
 * Returns the absolute path to the repo working directory.
 */
export function prepareRepo(instance: SWEBenchInstance, reposDir: string): string {
  const repoSlug = instance.repo.replace('/', '__')
  const repoDir = path.join(reposDir, repoSlug)

  // Clone if not present
  if (!fs.existsSync(repoDir)) {
    console.log(`  Cloning ${instance.repo}...`)
    execSync(`git clone https://github.com/${instance.repo}.git "${repoDir}"`, {
      timeout: 300_000,
      stdio: 'pipe',
    })
  }

  // Checkout base commit and clean
  execSync(`git checkout -f ${instance.base_commit} && git clean -fdx`, {
    cwd: repoDir,
    timeout: 60_000,
    stdio: 'pipe',
  })

  return repoDir
}

/**
 * Build the prompt given to the agent for solving an instance.
 * Deliberately omits hints_text, patch, and test_patch.
 */
export function buildPrompt(instance: SWEBenchInstance): string {
  return `You are working on a real GitHub repository to resolve an issue.

## Repository
${instance.repo}

## Issue
${instance.problem_statement}

## Instructions
- Navigate the repository to understand the codebase structure
- Identify the relevant files that need to be modified
- Make the necessary code changes to resolve the issue
- Do NOT modify any test files
- Do NOT add new test files
- Make minimal, focused changes that directly address the issue`
}

/**
 * Extract the agent's modifications as a git diff.
 * Includes both staged and unstaged changes relative to HEAD.
 */
export function extractPatch(repoDir: string): string {
  try {
    const diff = execSync('git diff HEAD', {
      cwd: repoDir,
      encoding: 'utf-8',
      timeout: 30_000,
    })
    return diff.trim()
  } catch {
    return ''
  }
}

/**
 * Reset the repo back to the base commit after solving.
 */
export function resetRepo(repoDir: string, baseCommit: string): void {
  execSync(`git checkout -f ${baseCommit} && git clean -fdx`, {
    cwd: repoDir,
    timeout: 60_000,
    stdio: 'pipe',
  })
}
