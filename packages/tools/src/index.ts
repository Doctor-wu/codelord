export { bashPlugin } from './core/bash.js'
export { fileReadPlugin } from './core/file-read.js'
export { fileWritePlugin } from './core/file-write.js'
export { fileEditPlugin } from './core/file-edit.js'
export { searchPlugin } from './core/search.js'
export { lsPlugin } from './core/ls.js'
export { webFetchPlugin } from './optional/web-fetch.js'
export { webSearchPlugin } from './optional/web-search.js'

import type { ToolPlugin } from '@codelord/core'
import { bashPlugin } from './core/bash.js'
import { fileReadPlugin } from './core/file-read.js'
import { fileWritePlugin } from './core/file-write.js'
import { fileEditPlugin } from './core/file-edit.js'
import { searchPlugin } from './core/search.js'
import { lsPlugin } from './core/ls.js'
import { webFetchPlugin } from './optional/web-fetch.js'
import { webSearchPlugin } from './optional/web-search.js'

/** All core tool plugins (always enabled) */
export const corePlugins: ToolPlugin[] = [
  bashPlugin,
  fileReadPlugin,
  fileWritePlugin,
  fileEditPlugin,
  searchPlugin,
  lsPlugin,
]

/** All optional tool plugins (require config/env to enable) */
export const optionalPlugins: ToolPlugin[] = [
  webFetchPlugin,
  webSearchPlugin,
]
