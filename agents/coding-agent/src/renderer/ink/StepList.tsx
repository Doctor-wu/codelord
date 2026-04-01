// ---------------------------------------------------------------------------
// StepList — list of completed (collapsed) steps
// ---------------------------------------------------------------------------

import { Box } from 'ink'
import type { StepState } from './state.js'
import { CollapsedStep } from './CollapsedStep.js'

interface StepListProps {
  steps: StepState[]
}

export function StepList({ steps }: StepListProps) {
  if (steps.length === 0) return null

  return (
    <Box flexDirection="column">
      {steps.map((step, index) => (
        <Box key={step.step} marginBottom={index === steps.length - 1 ? 0 : 1}>
          <CollapsedStep step={step} />
        </Box>
      ))}
    </Box>
  )
}
