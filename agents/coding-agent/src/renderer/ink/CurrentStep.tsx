// ---------------------------------------------------------------------------
// CurrentStep — expanded view of the active step with thought + tool call
// ---------------------------------------------------------------------------

import { Box, Text } from 'ink'
import type { StepState } from './state.js'
import { StepTextBlock } from './StepTextBlock.js'
import { ToolCallLine } from './ToolCallLine.js'
import { ToolOutputBlock } from './ToolOutputBlock.js'
import { WorkingIndicator } from './WorkingIndicator.js'

interface CurrentStepProps {
  step: StepState
}

export function CurrentStep({ step }: CurrentStepProps) {
  const lastTool = step.toolCalls[step.toolCalls.length - 1]
  const isToolRunning = Boolean(lastTool && !lastTool.endTime)

  if (!step.thought && !lastTool) {
    return <WorkingIndicator />
  }

  if (step.category === 'text') {
    return <StepTextBlock text={step.thought} />
  }

  return (
    <Box flexDirection="column">
      <StepTextBlock text={step.thought} />

      {lastTool && (
        <Box
          flexDirection="column"
          marginTop={step.thought ? 1 : 0}
        >
          <ToolCallLine toolCall={lastTool} isRunning={isToolRunning} />
          <ToolOutputBlock toolCall={lastTool} isRunning={isToolRunning} />
        </Box>
      )}
    </Box>
  )
}
