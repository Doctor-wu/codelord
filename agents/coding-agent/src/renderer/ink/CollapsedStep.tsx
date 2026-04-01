// ---------------------------------------------------------------------------
// CollapsedStep — single-line summary of a completed step
// ---------------------------------------------------------------------------

import { Box, Text } from 'ink'
import type { StepState } from './state.js'
import { STEP_COLORS } from './theme.js'
import { summarizeCommand, summarizeResult, summarizeText, summarizeThought } from './summarize.js'

interface CollapsedStepProps {
  step: StepState
}

export function CollapsedStep({ step }: CollapsedStepProps) {
  const color = STEP_COLORS[step.category]
  const isTextStep = step.category === 'text'
  const lastTool = step.toolCalls[step.toolCalls.length - 1]

  const thought = isTextStep ? summarizeText(step.thought) : summarizeThought(step.thought)
  const command = lastTool ? summarizeCommand(lastTool.command) : ''
  const result = lastTool
    ? summarizeResult(lastTool.result ?? '', lastTool.isError, lastTool.name)
    : 'done'
  const hasError = step.category === 'error'

  if (isTextStep) {
    return (
      <Box>
        <Text color="green">{'\u2713'}</Text>
        <Text> </Text>
        <Text>{thought}</Text>
      </Box>
    )
  }

  return (
    <Box>
      <Text color={hasError ? 'red' : 'green'}>{hasError ? '\u2717' : '\u2713'}</Text>
      <Text> </Text>
      <Text color={color} bold>{step.category.padEnd(6)}</Text>
      <Text> </Text>
      <Text dimColor>{thought}</Text>
      {command && (
        <>
          <Text dimColor> {'\u2014'} </Text>
          <Text>{command}</Text>
        </>
      )}
      <Text dimColor> {'\u2192'} </Text>
      <Text color={hasError ? 'red' : undefined}>{result}</Text>
    </Box>
  )
}
