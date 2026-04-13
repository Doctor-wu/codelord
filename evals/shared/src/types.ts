/** 所有 benchmark adapter 的统一输出格式 */
export interface EvalResult {
  /** benchmark 名称 */
  benchmark: 'polyglot' | 'swe-bench' | 'browsecomp' | 'terminal-bench'
  /** 模型标识，e.g. "claude-sonnet-4-6" */
  model: string
  /** provider 标识，e.g. "anthropic" */
  provider: string
  /** reasoning level */
  reasoningLevel: string
  /** ISO 8601 时间戳 */
  timestamp: string
  /** 运行配置 */
  config: EvalConfig
  /** 核心指标（benchmark-specific，全部为数值） */
  metrics: Record<string, number>
  /** 逐 case 结果 */
  cases: EvalCaseResult[]
  /** 运行级错误（不属于某个 case 的错误） */
  errors?: EvalError[]
  /** 总耗时 ms */
  durationMs: number
}

export interface EvalConfig {
  mode: 'subset' | 'full'
  limit?: number
  /** benchmark-specific 配置 */
  [key: string]: unknown
}

export interface EvalCaseResult {
  id: string
  passed: boolean
  durationMs: number
  error?: string
  /** benchmark-specific 扩展数据 */
  metadata?: Record<string, unknown>
}

export interface EvalError {
  type: string
  message: string
  caseId?: string
}
