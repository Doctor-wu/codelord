// ---------------------------------------------------------------------------
// CurrentStep — expanded view of the active step with thought + tool call
// ---------------------------------------------------------------------------

import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import type { StepState } from './state.js'
import { STEP_COLORS } from './theme.js'

interface CurrentStepProps {
  step: StepState
}

export function CurrentStep({ step }: CurrentStepProps) {
  const color = STEP_COLORS[step.category]
  const lastTool = step.toolCalls[step.toolCalls.length - 1]
  const isToolRunning = lastTool && !lastTool.result

  return (
    <Box flexDirection="column">
      {/* Step header with vertical bar */}
      <Box>
        <Text color={color}>{'\u2503'} </Text>
        <Text color={color}>
          <Spinner type="dots" />
        </Text>
        <Text> </Text>
        <Text color={color} bold>{step.category}</Text>
      </Box>

      {/* Thought (streamed text) */}
      {step.thought && (
        <Box>
          <Text color={color}>{'\u2503'} </Text>
          <Text italic dimColor>{step.thought}</Text>
        </Box>
      )}

      {/* Active tool call */}
      {lastTool && (
        <Box flexDirection="column">
          <Text color={color}>{'\u2503'} </Text>
          <Box>
            <Text color={color}>{'\u2503'} </Text>
            <Box borderStyle="round" borderColor={color} paddingX={1}>
              {isToolRunning ? (
                <Text>
                  <Spinner type="dots" />{' '}
                  <Text>{lastTool.command}</Text>
                </Text>
              ) : (
                <Text>{lastTool.command}</Text>
              )}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  )
}
