import { Box, Text, useStdout } from 'ink'
import type { ToolCallState } from './state.js'
import { classifyToolCall } from './classify.js'
import { META_COLOR, STEP_COLORS } from './theme.js'
import { formatToolResultLines, wrapPlainText } from './summarize.js'

interface ToolOutputBlockProps {
  toolCall: ToolCallState
  isRunning?: boolean
}

export function ToolOutputBlock({ toolCall, isRunning = false }: ToolOutputBlockProps) {
  const { stdout } = useStdout()
  const category = classifyToolCall(toolCall)
  const color = STEP_COLORS[category]
  const footerColor = toolCall.isError ? 'red' : 'green'
  const { headLines, tailLines, hiddenLineCount } = formatToolResultLines(toolCall.result ?? '')
  const contentWidth = Math.max(16, (stdout?.columns ?? 80) - 6)

  const outputLines = [
    ...buildWrappedOutputLines(headLines, {
      contentWidth,
      firstPrefix: '\u23BF ',
      continuationPrefix: '  ',
      isMeta: false,
      startWithFirstPrefix: true,
    }),
    ...(hiddenLineCount > 0
      ? buildWrappedOutputLines([`+${hiddenLineCount} lines`], {
          contentWidth,
          firstPrefix: '  ',
          continuationPrefix: '  ',
          isMeta: true,
          startWithFirstPrefix: true,
        })
      : []),
    ...buildWrappedOutputLines(tailLines, {
      contentWidth,
      firstPrefix: '  ',
      continuationPrefix: '  ',
      isMeta: false,
      startWithFirstPrefix: false,
    }),
  ]
  const statusLabel = !toolCall.endTime && outputLines.length === 0
    ? toolCall.isExecuting
      ? 'executing tool...'
      : 'building command...'
    : null

  return (
    <Box flexDirection="column">
      {statusLabel && (
        <Box>
          <Text color={color}>{'\u2503'} </Text>
          <Text dimColor>{'\u23BF '}</Text>
          <Text color={META_COLOR}>{statusLabel}</Text>
        </Box>
      )}

      {outputLines.map((line, index) => (
        <Box key={index}>
          <Text color={color}>{'\u2503'} </Text>
          <Text dimColor>{line.prefix}</Text>
          <Text
            color={line.isMeta ? META_COLOR : toolCall.isError ? 'red' : undefined}
          >
            {line.text || ' '}
          </Text>
        </Box>
      ))}

      {toolCall.endTime && (
        <Box>
          <Text color={color}>{'\u2503'} </Text>
          <Text color={footerColor}>
            {toolCall.isError ? '\u2717' : '\u2713'}
          </Text>
          <Text> </Text>
          <Text color={footerColor}>
            {toolCall.isError ? 'Tool call failed' : 'Tool call success'}
          </Text>
        </Box>
      )}
    </Box>
  )
}

interface WrappedOutputLine {
  prefix: string
  text: string
  isMeta: boolean
}

function buildWrappedOutputLines(
  lines: string[],
  options: {
    contentWidth: number
    firstPrefix: string
    continuationPrefix: string
    isMeta: boolean
    startWithFirstPrefix: boolean
  },
): WrappedOutputLine[] {
  const wrapped: WrappedOutputLine[] = []
  let useFirstPrefix = options.startWithFirstPrefix

  for (const line of lines) {
    const segments = wrapPlainText(line, options.contentWidth)

    segments.forEach((segment, index) => {
      wrapped.push({
        prefix: useFirstPrefix && index === 0
          ? options.firstPrefix
          : options.continuationPrefix,
        text: segment,
        isMeta: options.isMeta,
      })
    })

    useFirstPrefix = false
  }

  return wrapped
}
