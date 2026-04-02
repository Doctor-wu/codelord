// ---------------------------------------------------------------------------
// Thin aggregation layer — re-exports contracts from each tool module
// ---------------------------------------------------------------------------

export type { ToolContract } from './tool-contract.js'

export { bashContract } from './bash.js'
export { fileReadContract } from './file-read.js'
export { fileWriteContract } from './file-write.js'
export { fileEditContract } from './file-edit.js'
export { searchContract } from './search.js'
export { lsContract } from './ls.js'
export { askUserQuestionContract } from './ask-user.js'

import type { ToolContract } from './tool-contract.js'
import { bashContract } from './bash.js'
import { fileReadContract } from './file-read.js'
import { fileWriteContract } from './file-write.js'
import { fileEditContract } from './file-edit.js'
import { searchContract } from './search.js'
import { lsContract } from './ls.js'
import { askUserQuestionContract } from './ask-user.js'

/** All built-in tool contracts in stable display order */
export const builtinContracts: readonly ToolContract[] = [
  bashContract,
  fileReadContract,
  fileWriteContract,
  fileEditContract,
  searchContract,
  lsContract,
  askUserQuestionContract,
]
