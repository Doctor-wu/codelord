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

// ---------------------------------------------------------------------------
// Built-in tool contracts
// ---------------------------------------------------------------------------

export const bashContract: ToolContract = {
  toolName: 'bash',
  whenToUse: [
    'Shell pipelines, git commands, build tools, test runners, package managers.',
    'Commands that combine multiple operations (pipes, redirects, loops).',
    'Any operation not covered by a dedicated built-in tool.',
  ],
  whenNotToUse: [
    'Do not use bash cat/head/tail when you already know the file path — use file_read.',
    'Do not use bash sed/awk for precise edits — use file_edit.',
    'Do not use bash ls for simple directory browsing — use ls.',
    'Do not use bash grep/rg for code search — use search.',
  ],
  preconditions: [
    'The command must be a valid shell command.',
  ],
  failureSemantics: [
    'Non-zero exit code means the command failed (isError=true).',
    'Timeout means the command ran too long (isError=true).',
  ],
  fallbackHints: [
    'Check stderr output for error details.',
    'For permission errors, consider if the command needs elevated privileges.',
  ],
}

export const fileReadContract: ToolContract = {
  toolName: 'file_read',
  whenToUse: [
    'Reading file contents when you already know the path.',
    'Inspecting specific line ranges of large files.',
  ],
  whenNotToUse: [
    'Do not use for locating files — use search or ls first.',
    'Do not use when you do not know the file path yet.',
  ],
  preconditions: [
    'You must know the file path. If unknown, use ls or search to find it first.',
  ],
  failureSemantics: [
    'NOT_FOUND: file does not exist at the given path.',
    'PERMISSION_DENIED: insufficient permissions.',
    'INVALID_ARGS: path is a directory or arguments are missing.',
  ],
  fallbackHints: [
    'On NOT_FOUND, use ls to verify the path or search to locate the file.',
    'Use offset/limit for large files to avoid excessive output.',
  ],
}

export const fileWriteContract: ToolContract = {
  toolName: 'file_write',
  whenToUse: [
    'Creating a new file.',
    'Overwriting an entire file with known complete content.',
  ],
  whenNotToUse: [
    'Do not use for partial edits — use file_edit instead.',
    'Do not use if you only need to change a few lines in an existing file.',
  ],
  preconditions: [
    'You must have the complete file content ready.',
    'Parent directory must exist, or set create_directories=true.',
  ],
  failureSemantics: [
    'NOT_FOUND: parent directory does not exist (and create_directories is false).',
    'PERMISSION_DENIED: insufficient permissions.',
  ],
  fallbackHints: [
    'On NOT_FOUND, retry with create_directories=true.',
    'If only changing part of a file, switch to file_edit.',
  ],
}

export const fileEditContract: ToolContract = {
  toolName: 'file_edit',
  whenToUse: [
    'Making a targeted change in an existing file.',
    'Replacing a specific code block, line, or string.',
  ],
  whenNotToUse: [
    'Do not use if you do not know the exact content to replace.',
    'Do not use for creating new files — use file_write.',
    'Do not use for whole-file rewrites — use file_write.',
  ],
  preconditions: [
    'You must know the file path.',
    'old_string must appear exactly once in the file.',
    'Read the file first (file_read) if you are unsure of the exact content.',
  ],
  failureSemantics: [
    'NO_MATCH: old_string was not found — the file does not contain that text.',
    'MULTI_MATCH: old_string appears more than once — provide more surrounding context to make it unique.',
    'NOT_FOUND: the file does not exist.',
    'PERMISSION_DENIED: insufficient permissions.',
  ],
  fallbackHints: [
    'On NO_MATCH: use file_read to see the actual file content, then construct the correct old_string.',
    'On MULTI_MATCH: include more surrounding lines in old_string to make the match unique.',
    'If the change is too complex for search-and-replace, use file_write to rewrite the entire file.',
  ],
}

export const searchContract: ToolContract = {
  toolName: 'search',
  whenToUse: [
    'Locating code, symbols, error messages, or config values across the codebase.',
    'Finding which files contain a specific pattern when the location is unknown.',
  ],
  whenNotToUse: [
    'Do not use when you already know the file path — use file_read directly.',
    'Do not use for browsing directory structure — use ls.',
  ],
  preconditions: [
    'A search query must be provided.',
  ],
  failureSemantics: [
    'No matches found is NOT an error — the search completed successfully, there are simply no results.',
    'INVALID_ARGS: missing or invalid query.',
    'Timeout: search took too long.',
  ],
  fallbackHints: [
    'On no matches: try a broader query, different spelling, or remove glob filters.',
    'Use ls first to understand the directory structure, then narrow the search path.',
    'Try regex mode for more flexible pattern matching.',
  ],
}

export const lsContract: ToolContract = {
  toolName: 'ls',
  whenToUse: [
    'Exploring project structure and understanding what files exist.',
    'Building a mental map of a directory before reading or editing files.',
    'Verifying a path exists before using file_read or file_edit.',
  ],
  whenNotToUse: [
    'Do not use for reading file contents — use file_read.',
    'Do not use for searching text inside files — use search.',
  ],
  preconditions: [],
  failureSemantics: [
    'NOT_FOUND: directory does not exist.',
    'PERMISSION_DENIED: insufficient permissions.',
    'Empty directory is NOT an error — the listing succeeded, the directory is simply empty.',
  ],
  fallbackHints: [
    'Use recursive=true to see nested structure.',
    'Use glob filter to narrow results in large directories.',
  ],
}

export const askUserQuestionContract: ToolContract = {
  toolName: 'AskUserQuestion',
  whenToUse: [
    'Genuine ambiguity that would materially affect the outcome if guessed wrong.',
    'Missing critical information that cannot be inferred from context or code.',
  ],
  whenNotToUse: [
    'Do not ask for confirmation of routine actions.',
    'Do not ask when you can figure out the answer from the codebase.',
    'Do not use to defer decisions you should make yourself.',
    'Do not ask rhetorical or obvious questions.',
  ],
  preconditions: [
    'You must have already attempted to resolve the ambiguity using available tools.',
    'Only one question can be pending at a time.',
  ],
  failureSemantics: [
    'The user answer arrives as a normal user message, not a toolResult.',
  ],
  fallbackHints: [
    'If the user does not answer, proceed with the default_plan_if_no_answer.',
    'Provide clear options when possible to make answering easy.',
  ],
}

/** All built-in tool contracts, keyed by tool name */
export const builtinContracts: ReadonlyMap<string, ToolContract> = new Map([
  [bashContract.toolName, bashContract],
  [fileReadContract.toolName, fileReadContract],
  [fileWriteContract.toolName, fileWriteContract],
  [fileEditContract.toolName, fileEditContract],
  [searchContract.toolName, searchContract],
  [lsContract.toolName, lsContract],
  [askUserQuestionContract.toolName, askUserQuestionContract],
])
