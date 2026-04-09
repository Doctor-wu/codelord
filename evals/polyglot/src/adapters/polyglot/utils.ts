import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Copy an exercise directory recursively.
 */
export async function copyExerciseDir(src: string, dest: string): Promise<void> {
  await fs.cp(src, dest, { recursive: true })
}

/**
 * Find solution files for an exercise.
 * Tries .meta/config.json first, falls back to language-specific conventions.
 */
export async function findSolutionFiles(exerciseDir: string, language: string): Promise<string[]> {
  // Try .meta/config.json first
  const metaPath = path.join(exerciseDir, '.meta', 'config.json')
  try {
    const raw = await fs.readFile(metaPath, 'utf-8')
    const meta = JSON.parse(raw) as { files?: { solution?: string[] } }
    if (meta.files?.solution?.length) {
      return meta.files.solution
    }
  } catch {
    // No meta config or parse error — fall through to conventions
  }

  return findSolutionFilesByConvention(exerciseDir, language)
}

async function findSolutionFilesByConvention(exerciseDir: string, language: string): Promise<string[]> {
  switch (language) {
    case 'python': {
      const entries = await fs.readdir(exerciseDir)
      return entries.filter((f) => f.endsWith('.py') && !f.endsWith('_test.py') && !f.startsWith('__'))
    }
    case 'rust':
      return ['src/lib.rs']
    case 'go': {
      const entries = await fs.readdir(exerciseDir)
      return entries.filter((f) => f.endsWith('.go') && !f.endsWith('_test.go'))
    }
    case 'javascript': {
      const entries = await fs.readdir(exerciseDir)
      return entries.filter((f) => f.endsWith('.js') && !f.endsWith('.spec.js') && f !== 'node_modules')
    }
    case 'cpp': {
      const entries = await fs.readdir(exerciseDir)
      return entries.filter((f) => (f.endsWith('.cpp') || f.endsWith('.h')) && !f.endsWith('_test.cpp'))
    }
    case 'java': {
      const srcMain = path.join(exerciseDir, 'src', 'main', 'java')
      return collectFiles(srcMain, '.java', exerciseDir)
    }
    default:
      return []
  }
}

async function collectFiles(dir: string, ext: string, baseDir: string): Promise<string[]> {
  const results: string[] = []
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...(await collectFiles(full, ext, baseDir)))
      } else if (entry.name.endsWith(ext)) {
        results.push(path.relative(baseDir, full))
      }
    }
  } catch {
    // Directory doesn't exist
  }
  return results
}

/**
 * Truncate output, keeping first half and last half with a marker in between.
 */
export function truncateOutput(output: string, maxChars: number): string {
  if (output.length <= maxChars) return output
  const half = Math.floor(maxChars / 2)
  return output.slice(0, half) + '\n... [truncated] ...\n' + output.slice(-half)
}
