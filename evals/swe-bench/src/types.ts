/** A single SWE-bench task instance from the dataset */
export interface SWEBenchInstance {
  instance_id: string
  repo: string
  base_commit: string
  problem_statement: string
  hints_text: string
  patch: string // Gold answer — never shown to agent
  test_patch: string // Test patch — never shown to agent
  version: string
  FAIL_TO_PASS: string // JSON string of test names array
  PASS_TO_PASS: string // JSON string of test names array
  created_at: string
  environment_setup_commit: string
  difficulty?: string
}

/** A single prediction for SWE-bench evaluation */
export interface SWEBenchPrediction {
  instance_id: string
  model_name_or_path: string
  model_patch: string // git diff output
}

/** Result of solving a single instance */
export interface SolveResult {
  instance_id: string
  repo: string
  base_commit: string
  /** The generated patch (empty string if agent produced no changes) */
  model_patch: string
  /** Duration of the runHeadless call in ms */
  durationMs: number
  /** Trace ID for debugging */
  traceId: string
  /** If runHeadless itself threw */
  error?: string
}
