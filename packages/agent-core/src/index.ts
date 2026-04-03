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

export { ToolRouter } from './tool-router.js'
export type { ToolRouteDecision } from './tool-router.js'

export { bashTool, createBashToolHandler, bashContract } from './tools/bash.js'
export type { BashToolOptions } from './tools/bash.js'

export { fileReadTool, createFileReadHandler, fileReadContract } from './tools/file-read.js'
export type { FileReadOptions } from './tools/file-read.js'

export { fileWriteTool, createFileWriteHandler, fileWriteContract } from './tools/file-write.js'
export type { FileWriteOptions } from './tools/file-write.js'

export { fileEditTool, createFileEditHandler, fileEditContract } from './tools/file-edit.js'
export type { FileEditOptions } from './tools/file-edit.js'

export { searchTool, createSearchHandler, searchContract } from './tools/search.js'
export type { SearchOptions } from './tools/search.js'

export { lsTool, createLsHandler, lsContract } from './tools/ls.js'
export type { LsOptions } from './tools/ls.js'

export { askUserQuestionTool, ASK_USER_QUESTION_TOOL_NAME, askUserQuestionContract } from './tools/ask-user.js'
export type { PendingQuestion, ResolvedQuestion } from './tools/ask-user.js'

export { builtinContracts } from './tools/contracts.js'
export type { ToolContract } from './tools/contracts.js'
