// ---------------------------------------------------------------------------
// InputComposer — command deck: always-visible control center
// ---------------------------------------------------------------------------

import React, { useState } from 'react'
import { Box, Text, useInput, useStdout } from 'ink'
import Spinner from 'ink-spinner'
import { APP_COLOR, GLYPH, LANE } from './theme.js'

export type SessionMode = 'idle' | 'running' | 'waiting_answer' | 'interrupted' | 'error'

interface InputComposerProps {
  isActive: boolean
  onSubmit: (text: string) => void
  mode?: SessionMode
}

export function InputComposer({ isActive, onSubmit, mode = 'idle' }: InputComposerProps) {
  const [value, setValue] = useState('')
  const [cursor, setCursor] = useState(0)
  const { stdout } = useStdout()
  const width = Math.max(20, (stdout?.columns ?? 80) - 1)

  useInput((input, key) => {
    if (!isActive) return

    if (key.return) {
      const submitted = value
      setValue('')
      setCursor(0)
      onSubmit(submitted)
      return
    }

    if (key.backspace || key.delete) {
      if (cursor > 0) {
        setValue(prev => prev.slice(0, cursor - 1) + prev.slice(cursor))
        setCursor(prev => prev - 1)
      }
      return
    }

    if (key.leftArrow) {
      setCursor(prev => Math.max(0, prev - 1))
      return
    }

    if (key.rightArrow) {
      setCursor(prev => Math.min(value.length, prev + 1))
      return
    }

    if (input && !key.ctrl && !key.meta) {
      setValue(prev => prev.slice(0, cursor) + input + prev.slice(cursor))
      setCursor(prev => prev + input.length)
    }
  }, { isActive })

  const borderColor = getBorderColor(mode)
  const promptColor = getPromptColor(mode, isActive)
  const promptChar = mode === 'waiting_answer' ? '»' : '>'

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* ── Deck separator ── */}
      <Text color={borderColor}>{GLYPH.thickRule.repeat(width)}</Text>

      {/* ── Status strip ── */}
      <StatusStrip mode={mode} />

      {/* ── Input row — always user lane hue for prompt ── */}
      <Box>
        <Text color={promptColor} bold={isActive}>{promptChar} </Text>
        {isActive ? (
          <InputField value={value} cursor={cursor} />
        ) : (
          <Text dimColor> </Text>
        )}
      </Box>

      {/* ── Hint bar ── */}
      <HintBar mode={mode} />
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InputField({ value, cursor }: { value: string; cursor: number }) {
  const before = value.slice(0, cursor)
  const cursorChar = value[cursor] ?? ' '
  const after = value.slice(cursor + 1)

  return (
    <>
      <Text>{before}</Text>
      <Text inverse>{cursorChar}</Text>
      <Text>{after}</Text>
    </>
  )
}

function StatusStrip({ mode }: { mode: SessionMode }) {
  switch (mode) {
    case 'running':
      return (
        <Box>
          <Text color={APP_COLOR}><Spinner type="dots" /></Text>
          <Text color={APP_COLOR} bold> working</Text>
          <Text dimColor>  {GLYPH.thinRule}  Ctrl+C to interrupt</Text>
        </Box>
      )
    case 'waiting_answer':
      return (
        <Box>
          <Text color={LANE.control} bold>{GLYPH.live} YOUR TURN</Text>
          <Text dimColor>  {GLYPH.thinRule}  answer the question above</Text>
        </Box>
      )
    case 'interrupted':
      return (
        <Box>
          <Text color={LANE.control} bold>{GLYPH.phaseBlocked} PAUSED</Text>
          <Text dimColor>  {GLYPH.thinRule}  continue with your next input</Text>
        </Box>
      )
    case 'error':
      return (
        <Box>
          <Text color={LANE.error} bold>{GLYPH.phaseFail} ERROR</Text>
          <Text dimColor>  {GLYPH.thinRule}  type to continue</Text>
        </Box>
      )
    case 'idle':
    default:
      return (
        <Box>
          <Text color={LANE.muted}>{GLYPH.phaseDim} ready</Text>
        </Box>
      )
  }
}

function HintBar({ mode }: { mode: SessionMode }) {
  if (mode === 'running') return null
  return (
    <Box>
      <Text dimColor>Enter to send</Text>
      <Text dimColor>  {GLYPH.thinRule}  </Text>
      <Text dimColor>/exit to quit</Text>
    </Box>
  )
}

/** Deck border color — follows the dominant semantic lane for the current mode */
function getBorderColor(mode: SessionMode): string {
  switch (mode) {
    case 'running': return APP_COLOR
    case 'waiting_answer': return LANE.control
    case 'interrupted': return LANE.control
    case 'error': return LANE.error
    default: return LANE.muted
  }
}

/** Prompt character color — always user lane family, dimmed when inactive */
function getPromptColor(mode: SessionMode, isActive: boolean): string {
  if (!isActive) return LANE.userMuted
  // Active prompt is always user lane primary, regardless of mode
  // Exception: waiting_answer uses control color to signal "answer required"
  if (mode === 'waiting_answer') return LANE.control
  return LANE.user
}
