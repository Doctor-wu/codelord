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
      {steps.map((step) => (
        <CollapsedStep key={step.step} step={step} />
      ))}
    </Box>
  )
}
