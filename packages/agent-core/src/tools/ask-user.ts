import { Type } from '@mariozechner/pi-ai'
import type { Tool } from '@mariozechner/pi-ai'
import type { ToolContract } from './tool-contract.js'

// ---------------------------------------------------------------------------
// AskUserQuestion — control tool name
// ---------------------------------------------------------------------------

export const ASK_USER_QUESTION_TOOL_NAME = 'AskUserQuestion'

// ---------------------------------------------------------------------------
// AskUserQuestion — control tool definition
// ---------------------------------------------------------------------------

export const askUserQuestionTool: Tool = {
  name: ASK_USER_QUESTION_TOOL_NAME,
  description: [
    'Ask the user a clarifying question when you are genuinely uncertain',
    'about how to proceed. This pauses execution until the user responds.',
    'Only use this when the ambiguity would materially affect the outcome.',
    'Do NOT use this for rhetorical questions or confirmations.',
  ].join(' '),
  parameters: Type.Object({
    question: Type.String({
      description: 'The question to ask the user.',
    }),
    why_ask: Type.String({
      description: 'Why this question is necessary to proceed.',
    }),
    expected_answer_format: Type.Optional(
      Type.String({
        description: 'What kind of answer is expected (e.g. "yes/no", "a file path", "a number").',
      }),
    ),
    default_plan_if_no_answer: Type.Optional(
      Type.String({
        description: 'What the agent will do if the user does not answer.',
      }),
    ),
    options: Type.Optional(
      Type.Array(Type.String(), {
        description: 'Predefined options the user can choose from, if applicable.',
      }),
    ),
  }),
}

// ---------------------------------------------------------------------------
// PendingQuestion — structured representation stored on the runtime
// ---------------------------------------------------------------------------

export interface PendingQuestion {
  /** Tool call ID — correlates with the assistant message that triggered this */
  toolCallId: string
  /** The question text */
  question: string
  /** Why the agent needs to ask */
  whyAsk: string
  /** Expected answer format hint */
  expectedAnswerFormat?: string
  /** Fallback plan if user doesn't answer */
  defaultPlanIfNoAnswer?: string
  /** Predefined options */
  options?: string[]
  /** When the question was asked */
  askedAt: number
}

// ---------------------------------------------------------------------------
// ResolvedQuestion — lightweight record of a question-answer pair
// ---------------------------------------------------------------------------

export interface ResolvedQuestion {
  /** The original pending question */
  question: PendingQuestion
  /** The user's answer text */
  answer: string
  /** Timestamp when the answer was provided */
  resolvedAt: number
}

// ---------------------------------------------------------------------------
// AskUserQuestion — contract
// ---------------------------------------------------------------------------

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
  failureSemantics: ['The user answer arrives as a normal user message, not a toolResult.'],
  fallbackHints: [
    'If the user does not answer, proceed with the default_plan_if_no_answer.',
    'Provide clear options when possible to make answering easy.',
  ],
}
