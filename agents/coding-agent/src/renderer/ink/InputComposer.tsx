// ---------------------------------------------------------------------------
// InputComposer — always-visible input control with session state
// ---------------------------------------------------------------------------

import React, { useState } from 'react'
import { Box, Text, useInput, useStdout } from 'ink'
import Spinner from 'ink-spinner'
import { APP_COLOR } from './theme.js'

export type SessionMode = 'idle' | 'running' | 'waiting_answer' | 'interrupted' | 'error'

interface InputComposerProps {
  /** Whether the input field is active (accepts keystrokes) */
  isActive: boolean
  /** Called when the user submits a line (Enter) */
  onSubmit: (text: string) => void
  /** Current session mode for status display */
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

  const prompt = mode === 'waiting_answer' ? '» ' : '> '
  const promptColor = mode === 'waiting_answer' ? 'yellow' : 'cyan'

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Separator */}
      <Text dimColor>{'─'.repeat(width)}</Text>

      {/* Status line — always visible */}
      <StatusLine mode={mode} />

      {/* Input field — always visible, disabled when not active */}
      <Box>
        <Text color={isActive ? promptColor : 'gray'} bold={isActive}>{prompt}</Text>
        {isActive ? (
          <InputField value={value} cursor={cursor} />
        ) : (
          <Text dimColor> </Text>
        )}
      </Box>
    </Box>
  )
}

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

function StatusLine({ mode }: { mode: SessionMode }) {
  switch (mode) {
    case 'running':
      return (
        <Box>
          <Text color={APP_COLOR}><Spinner type="dots" /></Text>
          <Text dimColor> working</Text>
          <Text dimColor>    Ctrl+C to interrupt</Text>
        </Box>
      )
    case 'waiting_answer':
      return (
        <Box>
          <Text color="yellow">? </Text>
          <Text color="yellow">answer the question above</Text>
          <Text dimColor>    Enter to send</Text>
        </Box>
      )
    case 'interrupted':
      return (
        <Box>
          <Text color="yellow">⏸ </Text>
          <Text color="yellow">interrupted</Text>
          <Text dimColor>    continue with your next input</Text>
        </Box>
      )
    case 'error':
      return (
        <Box>
          <Text color="red">✗ </Text>
          <Text color="red">error occurred</Text>
          <Text dimColor>    type to continue</Text>
        </Box>
      )
    case 'idle':
    default:
      return (
        <Box>
          <Text dimColor>Enter to send · /exit to quit · Ctrl+C to interrupt</Text>
        </Box>
      )
  }
}
