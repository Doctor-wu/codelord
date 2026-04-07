// ---------------------------------------------------------------------------
// InputComposer — command deck with queue input support
// ---------------------------------------------------------------------------

import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import Spinner from 'ink-spinner'
import { APP_COLOR, GLYPH, LANE } from './theme.js'
import { matchCommandSuggestions } from '../../cli/commands.js'

export type SessionMode = 'idle' | 'running' | 'waiting_answer' | 'error'

interface InputComposerProps {
  isActive: boolean
  onSubmit: (text: string) => void
  onInterrupt?: () => void
  onExit?: () => void
  mode?: SessionMode
  /** Messages queued during running */
  pendingQueue?: string[]
  /** Whether the agent is currently running */
  isRunning?: boolean
}

export function InputComposer({
  isActive,
  onSubmit,
  onInterrupt,
  onExit,
  mode = 'idle',
  pendingQueue = [],
  isRunning = false,
}: InputComposerProps) {
  const [value, setValue] = useState('')
  const [cursor, setCursor] = useState(0)

  useInput((input, key) => {
    if (!isActive) return

    // Ctrl+C — exit (idle) or interrupt (running)
    if (input === 'c' && key.ctrl) {
      onExit?.()
      return
    }

    // Escape — interrupt only (never exit)
    if (key.escape) {
      onInterrupt?.()
      return
    }

    if (key.return) {
      const submitted = value
      setValue('')
      setCursor(0)
      if (submitted.trim()) onSubmit(submitted)
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

  const promptColor = getPromptColor(mode, isActive)
  const promptChar = mode === 'waiting_answer' ? '»' : '>'
  const queueCount = pendingQueue.length

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* ── Status strip (when there's something to show) ── */}
      {(mode !== 'idle' || queueCount > 0) && <StatusStrip mode={mode} queueCount={queueCount} />}

      {/* ── Queue preview (when messages are pending) ── */}
      {queueCount > 0 && (
        <QueuePreview queue={pendingQueue} />
      )}

      {/* ── Input row (spaced from status when running) ── */}
      <Box marginTop={mode === 'running' ? 1 : 0}>
        <Text color={promptColor} bold={isActive}>{promptChar} </Text>
        {isActive ? (
          <InputField value={value} cursor={cursor} />
        ) : (
          <Text dimColor> </Text>
        )}
      </Box>

      {/* ── Command suggestions (when typing `/`) ── */}
      <CommandSuggestions value={value} mode={mode} isRunning={isRunning} />

      {/* ── Hint bar ── */}
      <HintBar mode={mode} isRunning={isRunning} />
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

function StatusStrip({ mode, queueCount }: { mode: SessionMode; queueCount: number }) {
  switch (mode) {
    case 'running':
      return (
        <Box>
          <Text color={APP_COLOR}><Spinner type="dots" /></Text>
          <Text color={APP_COLOR} bold> working</Text>
          {queueCount > 0 && (
            <Text color={LANE.user}> {GLYPH.thinRule} {queueCount} queued</Text>
          )}
          <Text dimColor>  {GLYPH.thinRule}  Enter to queue · Esc to interrupt</Text>
        </Box>
      )
    case 'waiting_answer':
      return (
        <Box>
          <Text color={LANE.control} bold>{GLYPH.live} YOUR TURN</Text>
          <Text dimColor>  {GLYPH.thinRule}  answer the question above</Text>
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
      if (queueCount > 0) {
        return (
          <Box>
            <Text color={LANE.user}>{GLYPH.settled} {queueCount} queued</Text>
            <Text dimColor>  {GLYPH.thinRule}  will be sent on next run</Text>
          </Box>
        )
      }
      return null
  }
}

function QueuePreview({ queue }: { queue: string[] }) {
  // Show up to 3 most recent queued messages
  const visible = queue.slice(-3)
  const hidden = queue.length - visible.length

  return (
    <Box flexDirection="column">
      {hidden > 0 && (
        <Box>
          <Text color={LANE.userMuted}>  +{hidden} more queued</Text>
        </Box>
      )}
      {visible.map((msg, i) => {
        const preview = msg.length > 60 ? msg.slice(0, 57) + '…' : msg
        return (
          <Box key={i}>
            <Text color={LANE.userMuted}>  {GLYPH.settled} </Text>
            <Text color={LANE.userMuted}>{preview}</Text>
          </Box>
        )
      })}
    </Box>
  )
}

function CommandSuggestions({ value, mode, isRunning }: { value: string; mode: SessionMode; isRunning: boolean }) {
  const suggestions = matchCommandSuggestions(value, mode, isRunning)
  if (suggestions.length === 0) return null

  return (
    <Box flexDirection="column">
      {suggestions.map(cmd => (
        <Box key={cmd.name}>
          <Text dimColor>  {cmd.usage ?? cmd.name}</Text>
          <Text dimColor color={LANE.muted}>  {cmd.description}</Text>
        </Box>
      ))}
    </Box>
  )
}

function HintBar({ mode, isRunning }: { mode: SessionMode; isRunning: boolean }) {
  if (mode === 'running') return null
  return (
    <Box>
      <Text dimColor>/ for commands</Text>
      <Text dimColor>  {GLYPH.thinRule}  </Text>
      <Text dimColor>Enter to send</Text>
    </Box>
  )
}

function getPromptColor(mode: SessionMode, isActive: boolean): string {
  if (!isActive) return LANE.userMuted
  if (mode === 'waiting_answer') return LANE.control
  return LANE.user
}
