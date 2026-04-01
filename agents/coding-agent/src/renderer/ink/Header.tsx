// ---------------------------------------------------------------------------
// Header — app name + provider badge
// ---------------------------------------------------------------------------

import { Box, Text, useStdout } from 'ink'
import { APP_NAME, APP_COLOR, getProviderBrand } from './theme.js'

interface HeaderProps {
  version: string
  provider: string
  model: string
  isRunning: boolean
}

export function Header({ version, provider, model, isRunning }: HeaderProps) {
  const { stdout } = useStdout()
  const brand = getProviderBrand(provider)
  const separatorWidth = Math.max(40, (stdout?.columns ?? 80) - 1)

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Box>
          <Text color={APP_COLOR} bold>{APP_NAME}</Text>
          <Text dimColor> v{version}</Text>
        </Box>

        <Box>
          <Text color={isRunning ? 'green' : 'gray'}>
            {isRunning ? '\u25CF' : '\u25CB'}
          </Text>
          <Text> </Text>
          <Text color={brand.color}>{brand.symbol}</Text>
          <Text> </Text>
          <Text color={brand.color}>{model}</Text>
        </Box>
      </Box>

      <Text dimColor>{'\u2500'.repeat(separatorWidth)}</Text>
    </Box>
  )
}
