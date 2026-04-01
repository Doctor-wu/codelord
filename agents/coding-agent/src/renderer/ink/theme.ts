// ---------------------------------------------------------------------------
// Visual theme — colors, provider branding, step category palette
// ---------------------------------------------------------------------------

export type StepCategory = 'read' | 'write' | 'verify' | 'error'

/** Color used for each step category. */
export const STEP_COLORS: Record<StepCategory, string> = {
  read: 'green',
  write: 'yellow',
  verify: 'blue',
  error: 'red',
}

/** Provider branding — symbol + brand color for the header. */
export interface ProviderBrand {
  symbol: string
  color: string
}

export const PROVIDER_BRANDING: Record<string, ProviderBrand> = {
  anthropic: { symbol: '\u27C1', color: '#D4A27F' }, // ⟁  terracotta
  openai: { symbol: '\u25CE', color: '#10a37f' }, // ◎  OpenAI green
  'openai-codex': { symbol: '\u25CE', color: '#10a37f' },
  xai: { symbol: '\uD835\uDD4F', color: '#e0e0e0' }, // 𝕏
  google: { symbol: '\u2726', color: '#4285f4' }, // ✦  Google blue
  deepseek: { symbol: '\uD83D\uDC0B', color: '#4d6bfe' }, // 🐋 indigo
}

export const FALLBACK_BRAND: ProviderBrand = { symbol: '\u25CF', color: '#22c55e' }

/** Resolve provider branding, with fallback. */
export function getProviderBrand(provider: string): ProviderBrand {
  return PROVIDER_BRANDING[provider] ?? FALLBACK_BRAND
}

// ---------------------------------------------------------------------------
// TARDIS ASCII art (compact, 7 lines)
// ---------------------------------------------------------------------------

export const TARDIS_ART = [
  '     ___',
  '    |___|',
  '   /|   |\\',
  '  | | T | |',
  '  | |   | |',
  '  | |___| |',
  '  |_______|',
]

/** App name styling constants. */
export const APP_NAME = 'codelord'
export const APP_COLOR = '#7c3aed' // purple-600
