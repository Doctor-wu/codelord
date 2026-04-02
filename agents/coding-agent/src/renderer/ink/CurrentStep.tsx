// ---------------------------------------------------------------------------
// CurrentStep — expanded view of the active step with thinking, text, and tools
// ---------------------------------------------------------------------------

import { Box } from 'ink'
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
  const hasThinking = Boolean(step.thinking)
  const hasText = Boolean(step.text)

  if (!hasThinking && !hasText && !lastTool) {
    return <WorkingIndicator />
  }

  if (step.category === 'text') {
    return (
      <Box flexDirection="column">
        <StepTextBlock text={step.thinking} label="thinking" />
        <Box marginTop={hasThinking && hasText ? 1 : 0}>
          <StepTextBlock text={step.text} />
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <StepTextBlock text={step.thinking} label="thinking" />
      <Box marginTop={hasThinking && hasText ? 1 : 0}>
        <StepTextBlock text={step.text} />
      </Box>

      {lastTool && (
        <Box
          flexDirection="column"
          marginTop={hasThinking || hasText ? 1 : 0}
        >
          <ToolCallLine toolCall={lastTool} isRunning={isToolRunning} />
          <ToolOutputBlock toolCall={lastTool} isRunning={isToolRunning} />
        </Box>
      )}
    </Box>
  )
}
