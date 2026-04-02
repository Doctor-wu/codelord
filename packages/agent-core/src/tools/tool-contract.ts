// ---------------------------------------------------------------------------
// ToolContract — structured metadata describing how a tool should be used
// ---------------------------------------------------------------------------

export interface ToolContract {
  /** Tool name this contract applies to */
  toolName: string
  /** When this tool is the right choice */
  whenToUse: string[]
  /** When this tool should NOT be used */
  whenNotToUse: string[]
  /** What must be true before calling this tool */
  preconditions: string[]
  /** What different failure modes mean */
  failureSemantics: string[]
  /** What to try when this tool fails or returns empty results */
  fallbackHints: string[]
}
