// ---------------------------------------------------------------------------
// Header — ASCII logo + workspace info (first-screen identity)
// ---------------------------------------------------------------------------

import { Box, Text, useStdout } from 'ink'
import { APP_COLOR, GLYPH, getProviderBrand } from './theme.js'
import { homedir } from 'node:os'

interface HeaderProps {
  version: string
  cwd: string
  provider: string
  model: string
  reasoningLevel: string
}

const LOGO = [
  ' ██████╗ ██████╗ ██████╗ ███████╗██╗      ██████╗ ██████╗ ██████╗ ',
  '██╔════╝██╔═══██╗██╔══██╗██╔════╝██║     ██╔═══██╗██╔══██╗██╔══██╗',
  '██║     ██║   ██║██║  ██║█████╗  ██║     ██║   ██║██████╔╝██║  ██║',
  '██║     ██║   ██║██║  ██║██╔══╝  ██║     ██║   ██║██╔══██╗██║  ██║',
  '╚██████╗╚██████╔╝██████╔╝███████╗███████╗╚██████╔╝██║  ██║██████╔╝',
  ' ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝',
]

function shortenHome(path: string): string {
  const home = homedir()
  if (path === home) return '~'
  if (path.startsWith(home + '/')) return '~' + path.slice(home.length)
  return path
}

export function Header({ version, cwd, provider, model, reasoningLevel }: HeaderProps) {
  const { stdout } = useStdout()
  const cols = Math.max(40, (stdout?.columns ?? 80) - 1)
  const brand = getProviderBrand(provider)

  return (
    <Box flexDirection="column" marginTop={1}>
      {LOGO.map((line, i) => (
        <Text key={i} color={APP_COLOR} bold>{line}</Text>
      ))}
      <Text dimColor>  v{version}</Text>
      <Text> </Text>
      <Box>
        <Text dimColor>  {shortenHome(cwd)} · </Text>
        <Text color={brand.color}>{brand.symbol} {model}</Text>
        <Text dimColor> · reasoning:{reasoningLevel}</Text>
      </Box>
      <Text dimColor>{GLYPH.thinRule.repeat(cols)}</Text>
    </Box>
  )
}
