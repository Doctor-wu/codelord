// Dev entrypoint — delegates to the CLI
import './cli/index.js'

// Programmatic API for eval runners
export { runHeadless } from './cli/headless.js'
export type { HeadlessRunOptions, HeadlessRunResult } from './cli/headless.js'
