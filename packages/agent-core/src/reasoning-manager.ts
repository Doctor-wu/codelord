// ---------------------------------------------------------------------------
// ReasoningManager — reasoning state lifecycle per assistant turn
// ---------------------------------------------------------------------------

import type { AssistantReasoningState, ReasoningStatus } from './events.js'
import { createReasoningState } from './events.js'

export type ReasoningLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

// ---------------------------------------------------------------------------
// Reasoning visibility — what to show at each level
// ---------------------------------------------------------------------------

export interface ReasoningVisibility {
  /** Whether to show raw thought viewport to the user */
  showThoughtViewport: boolean
  /** Whether to show the derived reasoning summary line */
  showReasoningSummary: boolean
  /** Whether to show tool-level displayReason */
  showToolReason: boolean
}

/**
 * Determine what reasoning to show based on current config level.
 *
 * - off:      nothing visible
 * - minimal:  only tool displayReason (single line per tool)
 * - low/medium: tool displayReason + reasoning summary line
 * - high/xhigh: everything visible (thought viewport when available)
 */
export function resolveReasoningVisibility(level: ReasoningLevel): ReasoningVisibility {
  switch (level) {
    case 'off':
      return { showThoughtViewport: false, showReasoningSummary: false, showToolReason: false }
    case 'minimal':
      return { showThoughtViewport: false, showReasoningSummary: false, showToolReason: true }
    case 'low':
    case 'medium':
      return { showThoughtViewport: false, showReasoningSummary: true, showToolReason: true }
    case 'high':
    case 'xhigh':
      return { showThoughtViewport: true, showReasoningSummary: true, showToolReason: true }
  }
}

// ---------------------------------------------------------------------------
// sanitizeDisplayReason — clean text for single-line tool reason display
// ---------------------------------------------------------------------------

/** Ensure text is single-line, ≤80 chars, no newlines. */
export function sanitizeDisplayReason(text: string): string {
  // Collapse newlines to spaces
  let clean = text.replace(/[\r\n]+/g, ' ').trim()
  // If multiple sentences, take only the first
  const sentenceEnd = clean.match(/^(.+?[.!?])(?:\s|$)/)
  if (sentenceEnd?.[1]) clean = sentenceEnd[1]
  // Truncate to 80 chars
  if (clean.length > 80) clean = clean.slice(0, 77) + '...'
  return clean
}

// ---------------------------------------------------------------------------
// Structured reasoning extraction — heuristic patterns from chain-of-thought
// ---------------------------------------------------------------------------

/**
 * Regex patterns for extracting structured reasoning fields from raw thought text.
 * Each pattern matches a sentence containing the target signal.
 * Not NLU — just common LLM chain-of-thought patterns.
 */
const EXTRACTION_PATTERNS = {
  intent: /(?:^|\.\s+|\n)((?:I need to|I'll|I should|I want to|Let me|I'm going to|My plan is)[^.!?\n]*[.!?]?)/i,
  why: /(?:^|\.\s+|\n|\s)((?:because|since|the reason|this is needed|in order to)[^.!?\n]*[.!?]?)/i,
  uncertainty: /(?:^|\.\s+|\n)([^.!?\n]*(?:not sure|might|possibly|unclear|I think|maybe|probably)[^.!?\n]*[.!?]?)/i,
  risk: /(?:^|\.\s+|\n)([^.!?\n]*(?:could break|careful|danger|risk|warning|might fail|could cause)[^.!?\n]*[.!?]?)/i,
  expectedObservation: /(?:^|\.\s+|\n)([^.!?\n]*(?:expect to see|should show|should output|should return|will see)[^.!?\n]*[.!?]?)/i,
} as const

const MAX_FIELD_LENGTH = 120

function extractField(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern)
  if (!match?.[1]) return null
  const value = match[1].trim()
  if (value.length === 0) return null
  return value.length > MAX_FIELD_LENGTH ? value.slice(0, MAX_FIELD_LENGTH - 1) + '…' : value
}

// ---------------------------------------------------------------------------
// ReasoningManager
// ---------------------------------------------------------------------------

export class ReasoningManager {
  private _level: ReasoningLevel
  private _current: AssistantReasoningState | null = null

  constructor(level: ReasoningLevel = 'high') {
    this._level = level
  }

  get level(): ReasoningLevel { return this._level }
  get current(): AssistantReasoningState | null { return this._current }

  setLevel(level: ReasoningLevel): void { this._level = level }

  /**
   * Begin a new assistant turn.
   * Returns null when level is 'off' — no reasoning state is created (D13 fix).
   */
  beginTurn(): AssistantReasoningState | null {
    if (this._level === 'off') {
      this._current = null
      return null
    }
    this._current = createReasoningState()
    return this._current
  }

  /** Get the reasoning option to pass to streamSimple. */
  getStreamOption(modelSupportsReasoning: boolean): { reasoning: string } | Record<string, never> {
    if (modelSupportsReasoning && this._level !== 'off') {
      return { reasoning: this._level }
    }
    return {}
  }

  appendThought(delta: string): void {
    if (this._current) {
      this._current.rawThoughtText += delta
    }
  }

  setStatus(status: ReasoningStatus): void {
    if (this._current) {
      this._current.status = status
    }
  }

  endTurn(): void {
    if (this._current) {
      this.extractStructuredReasoning()
      this._current.status = 'completed'
    }
  }

  /** Snapshot of current state (for lifecycle emission). */
  snapshot(): AssistantReasoningState {
    return { ...(this._current ?? createReasoningState()) }
  }

  /**
   * Extract structured reasoning fields from rawThoughtText.
   * Heuristic regex — not NLU. Targets common LLM chain-of-thought patterns:
   * - intent: "I need to...", "I'll ...", "Let me..."
   * - why: "because...", "since..."
   * - uncertainty: "not sure...", "might..."
   * - risk: "could break...", "careful..."
   * - expectedObservation: "expect to see...", "should show..."
   *
   * Each field takes the first match, truncated to 120 chars.
   * Called once at endTurn() — no per-delta overhead.
   */
  private extractStructuredReasoning(): void {
    const s = this._current
    if (!s || s.rawThoughtText.length === 0) return

    const text = s.rawThoughtText
    if (!s.intent) s.intent = extractField(text, EXTRACTION_PATTERNS.intent)
    if (!s.why) s.why = extractField(text, EXTRACTION_PATTERNS.why)
    if (!s.uncertainty) s.uncertainty = extractField(text, EXTRACTION_PATTERNS.uncertainty)
    if (!s.risk) s.risk = extractField(text, EXTRACTION_PATTERNS.risk)
    if (!s.expectedObservation) s.expectedObservation = extractField(text, EXTRACTION_PATTERNS.expectedObservation)
  }
}
