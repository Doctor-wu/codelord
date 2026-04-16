// --- Consumer interface ---

export type Unsubscribe = () => void

export interface Pipeable<TDelta, TFinal> {
  /** Subscribe to receive delta events. Returns unsubscribe function. */
  subscribe(handler: (delta: TDelta) => void): Unsubscribe
  /** Returns a promise that resolves with the final value when complete, or rejects on error. */
  done(): Promise<TFinal>
}

// --- Full implementation (held by runtime) ---

type State<TFinal> = { kind: 'active' } | { kind: 'completed'; value: TFinal } | { kind: 'errored'; error: Error }

const noop: Unsubscribe = () => {}

export class PipeableImpl<TDelta, TFinal> implements Pipeable<TDelta, TFinal> {
  private _state: State<TFinal> = { kind: 'active' }
  private _subscribers = new Set<(delta: TDelta) => void>()
  private _resolve!: (value: TFinal) => void
  private _reject!: (reason: Error) => void
  private _donePromise: Promise<TFinal>

  constructor() {
    this._donePromise = new Promise<TFinal>((resolve, reject) => {
      this._resolve = resolve
      this._reject = reject
    })
    // Prevent unhandled rejection when error() is called but done() is never awaited
    this._donePromise.catch(() => {})
  }

  push(delta: TDelta): void {
    if (this._state.kind !== 'active') return
    for (const handler of Array.from(this._subscribers)) {
      handler(delta)
    }
  }

  complete(finalValue: TFinal): void {
    if (this._state.kind !== 'active') return
    this._state = { kind: 'completed', value: finalValue }
    this._resolve(finalValue)
    this._subscribers.clear()
  }

  error(err: Error): void {
    if (this._state.kind !== 'active') return
    this._state = { kind: 'errored', error: err }
    this._reject(err)
    this._subscribers.clear()
  }

  subscribe(handler: (delta: TDelta) => void): Unsubscribe {
    if (this._state.kind !== 'active') return noop
    this._subscribers.add(handler)
    return () => {
      this._subscribers.delete(handler)
    }
  }

  done(): Promise<TFinal> {
    return this._donePromise
  }

  get readable(): Pipeable<TDelta, TFinal> {
    return this
  }
}
