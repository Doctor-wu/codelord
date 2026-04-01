// ---------------------------------------------------------------------------
// App — top-level Ink component, consumes AppState
// ---------------------------------------------------------------------------

import { Box } from 'ink'
import type { AppState } from './state.js'
import { Header } from './Header.js'
import { StepList } from './StepList.js'
import { CurrentStep } from './CurrentStep.js'
import { FinalAnswer } from './FinalAnswer.js'
import { StatusBar, StatusBarContent } from './StatusBar.js'

interface AppProps {
  state: AppState
  version: string
  provider: string
  model: string
}

export function App({ state, version, provider, model }: AppProps) {
  return (
    <Box flexDirection="column">
      <Header
        version={version}
        provider={provider}
        model={model}
        isRunning={state.isRunning}
      />

      {/* Completed steps */}
      <StepList steps={state.steps} />

      {/* Current active step */}
      {state.currentStep && !state.currentStep.isComplete && (
        <CurrentStep step={state.currentStep} />
      )}

      {/* Final answer or error */}
      {!state.isRunning && (
        <FinalAnswer answer={state.finalAnswer} error={state.error} />
      )}

      {/* Bottom status bar */}
      <StatusBar state={state} />
      <StatusBarContent state={state} />
    </Box>
  )
}
