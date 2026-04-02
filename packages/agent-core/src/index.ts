export { runAgent } from './react-loop.js'
export type {
  AgentEvent,
  AgentResult,
  AgentSuccess,
  AgentError,
  RunAgentOptions,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolHandler,
} from './react-loop.js'

export { AgentRuntime } from './runtime.js'
export type {
  RuntimeState,
  RuntimeOptions,
  RunOutcome,
  OutcomeSuccess,
  OutcomeError,
  OutcomeBlocked,
  PartialAssistant,
} from './runtime.js'

export { bashTool, createBashToolHandler } from './tools/bash.js'
export type { BashToolOptions } from './tools/bash.js'

export { fileReadTool, createFileReadHandler } from './tools/file-read.js'
export type { FileReadOptions } from './tools/file-read.js'

export { fileWriteTool, createFileWriteHandler } from './tools/file-write.js'
export type { FileWriteOptions } from './tools/file-write.js'

export { fileEditTool, createFileEditHandler } from './tools/file-edit.js'
export type { FileEditOptions } from './tools/file-edit.js'

export { searchTool, createSearchHandler } from './tools/search.js'
export type { SearchOptions } from './tools/search.js'

export { lsTool, createLsHandler } from './tools/ls.js'
export type { LsOptions } from './tools/ls.js'

export { askUserQuestionTool, ASK_USER_QUESTION_TOOL_NAME } from './tools/ask-user.js'
export type { PendingQuestion, ResolvedQuestion } from './tools/ask-user.js'

export {
  builtinContracts,
  bashContract,
  fileReadContract,
  fileWriteContract,
  fileEditContract,
  searchContract,
  lsContract,
  askUserQuestionContract,
} from './tools/contracts.js'
export type { ToolContract } from './tools/contracts.js'
