// ---------------------------------------------------------------------------
// Visual theme — colors, provider branding, step category palette
// ---------------------------------------------------------------------------

export type StepCategory = 'read' | 'write' | 'verify' | 'error' | 'text'

/** Color used for each step category. */
export const STEP_COLORS: Record<StepCategory, string> = {
  read: 'green',
  write: 'yellow',
  verify: 'blue',
  error: 'red',
  text: '#1e50a0',
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

/** App name styling constants. */
export const APP_NAME = 'codelord'
export const APP_COLOR = '#1e50a0' // TARDIS blue
export const META_COLOR = 'gray'

// ---------------------------------------------------------------------------
// Operator console palette — semantic lane color tokens
// ---------------------------------------------------------------------------
// Rule: one semantic lane = one hue family.
// Variants within a family differ only in weight (bold/dim), not hue.
// ---------------------------------------------------------------------------

/** Semantic lane color families */
export const LANE = {
  // User lane — cyan family throughout
  user: '#5ccfe6', // primary: label, rail, active prompt
  userMuted: '#3a8a99', // secondary: content rail, inactive prompt
  // Assistant lane — cool gray-blue family
  assistant: '#8888aa', // primary: rail, label
  assistantMuted: '#666680', // secondary: settled content rail
  // Reasoning lane — dim indigo family (subset of assistant hue)
  reasoning: '#7777aa', // primary: icon, text
  reasoningMuted: '#555577', // secondary: settled
  // Control lane — amber family (questions, paused, waiting)
  control: '#e6b450', // primary: labels, borders, icons
  controlMuted: '#997a35', // secondary: descriptions
  // Error — red family
  error: '#e05555', // primary
  errorMuted: '#993a3a', // secondary
  // Muted / settled — neutral
  muted: '#555555', // inactive, disabled, settled
} as const

/** Box-drawing characters for structured layout */
export const GLYPH = {
  // Lane markers
  userMark: '▍',
  assistantMark: '▏',
  reasoningMark: '▏',
  // Batch structure
  batchTop: '┌',
  batchMid: '│',
  batchBot: '└',
  batchActive: '┃',
  // Tool phases
  phaseActive: '●',
  phasePulse: '◉',
  phaseDim: '○',
  phaseDone: '✓',
  phaseFail: '✗',
  phaseBlocked: '⊘',
  // Status
  live: '▸',
  settled: '▹',
  // Separators
  thinRule: '─',
  thickRule: '━',
} as const
