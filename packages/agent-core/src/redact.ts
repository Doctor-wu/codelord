// ---------------------------------------------------------------------------
// Secret Redaction — minimal pattern-based redaction for trace/memory safety
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Redaction hit metadata
// ---------------------------------------------------------------------------

export interface RedactionHit {
  type: string
  count: number
}

export interface RedactionResult {
  text: string
  hits: RedactionHit[]
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

interface RedactionPattern {
  type: string
  label: string
  regex: RegExp
}

const PATTERNS: RedactionPattern[] = [
  { type: 'PRIVATE_KEY', label: 'REDACTED:PRIVATE_KEY', regex: /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g },
  { type: 'BEARER_TOKEN', label: 'REDACTED:BEARER_TOKEN', regex: /Bearer\s+[A-Za-z0-9_.~+/=-]{20,}/gi },
  { type: 'COOKIE', label: 'REDACTED:COOKIE', regex: /(?:Cookie|Set-Cookie):\s*[^\r\n]+/gi },
  { type: 'AUTH_HEADER', label: 'REDACTED:AUTH_HEADER', regex: /Authorization:\s*\S+/gi },
  { type: 'GITHUB_TOKEN', label: 'REDACTED:GITHUB_TOKEN', regex: /\b(ghp_|github_pat_)[A-Za-z0-9_]{20,}\b/g },
  { type: 'API_KEY', label: 'REDACTED:API_KEY', regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
]

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Redact known secret patterns from text.
 * Returns the redacted text and metadata about what was found.
 */
export function redact(text: string): RedactionResult {
  const hitMap = new Map<string, number>()
  let result = text

  for (const pattern of PATTERNS) {
    const matches = result.match(pattern.regex)
    if (matches && matches.length > 0) {
      hitMap.set(pattern.type, (hitMap.get(pattern.type) ?? 0) + matches.length)
      result = result.replace(pattern.regex, `[${pattern.label}]`)
    }
  }

  const hits: RedactionHit[] = []
  for (const [type, count] of hitMap) {
    hits.push({ type, count })
  }

  return { text: result, hits }
}

/**
 * Truncate text to a maximum length for trace preview.
 * Appends '…' if truncated.
 */
export function previewText(text: string, maxLen = 2000): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '…'
}

/**
 * Redact and truncate for trace-safe preview.
 */
export function safePreview(text: string, maxLen = 2000): { text: string; hits: RedactionHit[] } {
  const { text: redacted, hits } = redact(text)
  return { text: previewText(redacted, maxLen), hits }
}
