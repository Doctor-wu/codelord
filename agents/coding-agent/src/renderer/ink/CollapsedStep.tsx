// ---------------------------------------------------------------------------
// CollapsedStep — single-line summary of a completed step
// ---------------------------------------------------------------------------

import { Box } from 'ink'
import type { StepState } from './state.js'
import { StepTextBlock } from './StepTextBlock.js'
import { ToolCallLine } from './ToolCallLine.js'
import { ToolOutputBlock } from './ToolOutputBlock.js'

interface CollapsedStepProps {
  step: StepState
}

export function CollapsedStep({ step }: CollapsedStepProps) {
  const hasThinking = Boolean(step.thinking)
  const hasText = Boolean(step.text)

  if (step.category === 'text') {
    return (
      <Box flexDirection="column">
        <StepTextBlock text={step.thinking} label="thinking" />
        <StepTextBlock text={step.text} />
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <StepTextBlock text={step.thinking} label="thinking" />
      <Box marginTop={hasThinking && hasText ? 1 : 0}>
        <StepTextBlock text={step.text} />
      </Box>

      {step.toolCalls.map((toolCall, index) => (
        <Box
          key={`${step.step}-${index}`}
          flexDirection="column"
          marginTop={hasThinking || hasText || index > 0 ? 1 : 0}
        >
          <ToolCallLine toolCall={toolCall} />
          <ToolOutputBlock toolCall={toolCall} />
        </Box>
      ))}
    </Box>
  )
}
