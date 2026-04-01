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
  if (step.category === 'text') {
    return <StepTextBlock text={step.thought} />
  }

  return (
    <Box flexDirection="column">
      <StepTextBlock text={step.thought} />

      {step.toolCalls.map((toolCall, index) => (
        <Box
          key={`${step.step}-${index}`}
          flexDirection="column"
          marginTop={step.thought || index > 0 ? 1 : 0}
        >
          <ToolCallLine toolCall={toolCall} />
          <ToolOutputBlock toolCall={toolCall} />
        </Box>
      ))}
    </Box>
  )
}
