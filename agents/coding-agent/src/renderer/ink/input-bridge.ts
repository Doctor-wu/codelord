// ---------------------------------------------------------------------------
// InputBridge — connects Ink input to REPL and runtime queue
// ---------------------------------------------------------------------------

import type { RuntimeQueueInfo } from '../types.js'

export class InputBridge {
  private _isActive = false
  private _isRunning = false
  private _resolve: ((value: string | null) => void) | null = null
  private _queueTarget: ((text: string) => void) | null = null
  private _interruptHandler: (() => void) | null = null
  private _exitHandler: (() => void) | null = null
  private _onChange: (() => void) | null = null

  // Runtime queue info (read-only projection for UI)
  private _runtimeQueue: RuntimeQueueInfo | null = null

  get isActive(): boolean { return this._isActive }
  get isRunning(): boolean { return this._isRunning }
  get runtimeQueue(): RuntimeQueueInfo | null { return this._runtimeQueue }

  setOnChange(callback: () => void): void { this._onChange = callback }

  setActive(active: boolean): void {
    this._isActive = active
    this._onChange?.()
  }

  setRunning(running: boolean, runtimeQueue?: RuntimeQueueInfo): void {
    this._isRunning = running
    this._runtimeQueue = runtimeQueue ?? null
    this._isActive = true
    this._onChange?.()
  }

  setQueueTarget(enqueue: (text: string) => void): void { this._queueTarget = enqueue }
  setInterruptHandler(handler: () => void): void { this._interruptHandler = handler }
  setExitHandler(handler: () => void): void { this._exitHandler = handler }

  submit(text: string): void {
    const isSlashCommand = text.trimStart().startsWith('/')
    if (this._isRunning && this._queueTarget && !isSlashCommand) {
      this._queueTarget(text)
      this._onChange?.()
    } else if (this._resolve) {
      const resolve = this._resolve
      this._resolve = null
      resolve(text)
    }
  }

  interrupt(): void { this._interruptHandler?.() }
  exit(): void { this._exitHandler?.() }

  waitForInput(): Promise<string | null> {
    return new Promise(resolve => { this._resolve = resolve })
  }

  close(): void {
    if (this._resolve) {
      this._resolve(null)
      this._resolve = null
    }
  }
}