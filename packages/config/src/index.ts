export { loadConfig } from './load.js'
export { DEFAULT_CONFIG, validateConfig } from './schema.js'
export type { CodelordConfig, BashConfig, ReasoningLevel } from './schema.js'

export {
  resolveCodelordHome,
  workspaceSlug,
  workspaceId,
  workspaceDir,
  sessionsDir,
  tracesDir,
  shadowGitDir,
  touchWorkspaceMeta,
} from './paths.js'
export type { WorkspaceMeta } from './paths.js'
