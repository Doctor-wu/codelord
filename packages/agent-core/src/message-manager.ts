// ---------------------------------------------------------------------------
// MessageManager — message history and pending inbound queue
// ---------------------------------------------------------------------------

import type { Message } from '@mariozechner/pi-ai'

export interface DrainResult {
  drained: Message[]
  userParts: string[]
}

export class MessageManager {
  readonly messages: Message[] = []
  private _pendingInbound: Message[] = []

  get pendingInboundCount(): number { return this._pendingInbound.length }

  get pendingInboundPreviews(): string[] {
    return this._pendingInbound
      .filter(m => m.role === 'user' && typeof m.content === 'string')
      .map(m => m.content as string)
  }

  enqueue(message: Message): void {
    this._pendingInbound.push(message)
  }

  enqueueUserMessage(content: string): void {
    this.enqueue({ role: 'user', content, timestamp: Date.now() })
  }

  /**
   * Drain all pending inbound messages into the main history.
   * Returns the drained messages and merged user text parts, or null if nothing to drain.
   */
  drain(): DrainResult | null {
    if (this._pendingInbound.length === 0) return null
    const drained = [...this._pendingInbound]
    this.messages.push(...drained)
    this._pendingInbound = []
    const userParts = drained
      .filter(m => m.role === 'user' && typeof m.content === 'string')
      .map(m => m.content as string)
    return { drained, userParts }
  }

  /** Export pending inbound for snapshot. */
  exportPending(): Message[] { return [...this._pendingInbound] }

  /** Restore from snapshot. */
  hydrate(messages: Message[], pendingInbound: Message[]): void {
    this.messages.length = 0
    this.messages.push(...messages)
    this._pendingInbound = [...pendingInbound]
  }
}
