// ---------------------------------------------------------------------------
// InputComposer — minimal Ink-managed text input for the REPL
// ---------------------------------------------------------------------------

import React, { useState, useCallback } from 'react'
import { Box, Text, useInput } from 'ink'

interface InputComposerProps {
  /** Whether the input field is active (accepts keystrokes) */
  isActive: boolean
  /** Called when the user submits a line (Enter) */
  onSubmit: (text: string) => void
  /** Prompt prefix */
  prompt?: string
}

export function InputComposer({ isActive, onSubmit, prompt = '> ' }: InputComposerProps) {
  const [value, setValue] = useState('')
  const [cursor, setCursor] = useState(0)

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

    // Regular character input
    if (input && !key.ctrl && !key.meta) {
      setValue(prev => prev.slice(0, cursor) + input + prev.slice(cursor))
      setCursor(prev => prev + input.length)
    }
  }, { isActive })

  if (!isActive) return null

  // Render the input line with a cursor indicator
  const before = value.slice(0, cursor)
  const cursorChar = value[cursor] ?? ' '
  const after = value.slice(cursor + 1)

  return (
    <Box marginTop={1}>
      <Text color="cyan" bold>{prompt}</Text>
      <Text>{before}</Text>
      <Text inverse>{cursorChar}</Text>
      <Text>{after}</Text>
    </Box>
  )
}
