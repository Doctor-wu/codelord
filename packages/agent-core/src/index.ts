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

export { ToolSafetyPolicy } from './tool-safety.js'
export type { RiskLevel, ToolSafetyDecision } from './tool-safety.js'

export { createToolCallLifecycle, _resetProvisionalIdCounter, createReasoningState, projectDisplayReason, createUsageAggregate } from './events.js'
export type {
  ToolCallLifecycle,
  ToolCallPhase,
  ToolCallRouteInfo,
  ToolCallSafetyInfo,
  LifecycleEvent,
  AssistantReasoningState,
  ReasoningStatus,
  QuestionDetail,
  UsageAggregate,
  UsageCostBreakdown,
} from './events.js'

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

export { toSessionMeta, resolveResumeState } from './session-snapshot.js'
export type { SessionSnapshot, SessionMeta } from './session-snapshot.js'

export type { CheckpointRecord, FileSnapshot } from './checkpoint.js'

export { redact, previewText, safePreview } from './redact.js'
export type { RedactionHit, RedactionResult } from './redact.js'

export type {
  TraceRun, TraceStep, TraceEvent,
  TraceLLMCall, TraceToolExecution, TraceQueueMessage, TraceAskUser, TraceUserInterrupt,
  TraceRunV2, TraceStepV2, TraceStepLedgers,
  ProviderStreamTraceEvent, AgentTraceEvent, LifecycleTraceEvent,
} from './trace.js'

export { checkTrace, formatCheckResult, normalizeTrace } from './trace-check.js'
export type { CheckResult, CheckIssue, CheckSeverity } from './trace-check.js'
