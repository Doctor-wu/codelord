// ---------------------------------------------------------------------------
// Header — single-line app name + provider badge
// ---------------------------------------------------------------------------

import { Box, Text } from 'ink'
import { APP_NAME, APP_COLOR, getProviderBrand } from './theme.js'

interface HeaderProps {
  version: string
  provider: string
  model: string
  isRunning: boolean
}

export function Header({ version, provider, model, isRunning }: HeaderProps) {
  const brand = getProviderBrand(provider)

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

      {/* Separator */}
      <Text dimColor>{'\u2500'.repeat(60)}</Text>
    </Box>
  )
}
