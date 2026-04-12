export interface BrowseCompEntry {
  question: string
  answer: string
  canary: string
}

export interface BrowseCompResult {
  id: number // 0-based index in dataset
  question: string
  referenceAnswer: string
  agentResponse: string
  extractedAnswer: string
  confidence: number
  grade: 'CORRECT' | 'INCORRECT' | 'ERROR'
  graderReasoning: string
  durationMs: number
  traceId: string
  error?: string
}

export interface BrowseCompSummary {
  timestamp: string
  model: string
  totalQuestions: number
  correctCount: number
  incorrectCount: number
  errorCount: number
  accuracy: number
  avgDurationMs: number
  avgConfidence: number
  results: BrowseCompResult[]
}
