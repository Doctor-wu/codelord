// ---------------------------------------------------------------------------
// InterruptController — interrupt flag and abort signal management
// ---------------------------------------------------------------------------

export class InterruptController {
  private _requested = false
  private _abortController: AbortController | null = null

  get isRequested(): boolean {
    return this._requested
  }

  /** Request an interrupt. If a stream is active, aborts it immediately. */
  requestInterrupt(): void {
    this._requested = true
    this._abortController?.abort()
  }

  /** Consume the interrupt flag. Returns true if it was set, and resets it. */
  consume(): boolean {
    if (!this._requested) return false
    this._requested = false
    return true
  }

  /** Create a new AbortController for a streaming turn, return its signal. */
  createAbortSignal(): AbortSignal {
    this._abortController = new AbortController()
    return this._abortController.signal
  }

  /** Clear the abort controller after a stream ends. */
  clearAbort(): void {
    this._abortController = null
  }
}
