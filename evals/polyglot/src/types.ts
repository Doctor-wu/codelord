export interface ExerciseInfo {
  /** e.g. "python/two-bucket" */
  id: string
  /** e.g. "python" */
  language: string
  /** e.g. "two-bucket" */
  exerciseName: string
  /** Absolute path to exercise directory */
  exerciseDir: string
  /** Relative paths within exerciseDir to the files agent should modify */
  solutionFiles: string[]
  /** Shell command to run tests in the exercise directory */
  testCommand: string
}

export interface AttemptRecord {
  durationMs: number
  traceId: string
  testOutput: string
}

export interface ExerciseResult {
  id: string
  language: string
  exerciseName: string
  passedAttempt1: boolean
  /** null if attempt 1 passed (no retry needed) */
  passedAttempt2: boolean | null
  attempt1: AttemptRecord
  attempt2?: AttemptRecord
  /** If runHeadless itself threw */
  error?: string
}

export interface BenchmarkSummary {
  timestamp: string
  totalExercises: number
  passAttempt1: number
  passAttempt2: number
  passRate1: number
  passRate2: number
  byLanguage: Record<
    string,
    {
      total: number
      passAttempt1: number
      passAttempt2: number
      passRate1: number
      passRate2: number
    }
  >
  results: ExerciseResult[]
}
