import { Type } from '@mariozechner/pi-ai'
import type { Tool } from '@mariozechner/pi-ai'

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
}
