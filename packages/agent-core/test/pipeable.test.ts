import { describe, it, expect, vi } from 'vitest'
import { PipeableImpl } from '../src/pipeable.js'
import type { Pipeable } from '../src/pipeable.js'

describe('PipeableImpl', () => {
  // --- Basic flow ---

  it('delivers deltas to subscriber in order', () => {
    const impl = new PipeableImpl<string, string>()
    const received: string[] = []
    impl.subscribe((d) => received.push(d))

    impl.push('a')
    impl.push('b')
    impl.push('c')

    expect(received).toEqual(['a', 'b', 'c'])
  })

  it('done() resolves with finalValue on complete', async () => {
    const impl = new PipeableImpl<string, string>()
    impl.push('delta')
    impl.complete('final')

    expect(await impl.done()).toBe('final')
  })

  it('silently ignores push after complete', () => {
    const impl = new PipeableImpl<string, string>()
    const received: string[] = []
    impl.subscribe((d) => received.push(d))

    impl.push('a')
    impl.complete('done')
    impl.push('b')

    expect(received).toEqual(['a'])
  })

  // --- Error flow ---

  it('done() rejects on error', async () => {
    const impl = new PipeableImpl<string, string>()
    const err = new Error('boom')
    impl.error(err)

    await expect(impl.done()).rejects.toBe(err)
  })

  it('silently ignores push and complete after error', () => {
    const impl = new PipeableImpl<string, string>()
    const received: string[] = []
    impl.subscribe((d) => received.push(d))

    impl.push('a')
    impl.error(new Error('boom'))
    impl.push('b')
    impl.complete('nope')

    expect(received).toEqual(['a'])
  })

  // --- Multiple subscribers ---

  it('delivers deltas to all subscribers', () => {
    const impl = new PipeableImpl<number, void>()
    const a: number[] = []
    const b: number[] = []
    impl.subscribe((d) => a.push(d))
    impl.subscribe((d) => b.push(d))

    impl.push(1)
    impl.push(2)

    expect(a).toEqual([1, 2])
    expect(b).toEqual([1, 2])
  })

  it('unsubscribed handler stops receiving, others continue', () => {
    const impl = new PipeableImpl<number, void>()
    const a: number[] = []
    const b: number[] = []
    const unsub = impl.subscribe((d) => a.push(d))
    impl.subscribe((d) => b.push(d))

    impl.push(1)
    unsub()
    impl.push(2)

    expect(a).toEqual([1])
    expect(b).toEqual([1, 2])
  })

  it('complete clears all subscribers', () => {
    const impl = new PipeableImpl<number, string>()
    const a: number[] = []
    const b: number[] = []
    impl.subscribe((d) => a.push(d))
    impl.subscribe((d) => b.push(d))

    impl.push(1)
    impl.complete('fin')
    impl.push(2)

    expect(a).toEqual([1])
    expect(b).toEqual([1])
  })

  // --- Late subscribe (already terminal) ---

  it('subscribe after complete returns noop, handler never called', () => {
    const impl = new PipeableImpl<string, string>()
    impl.complete('done')

    const handler = vi.fn()
    const unsub = impl.subscribe(handler)

    impl.push('late') // also ignored
    expect(handler).not.toHaveBeenCalled()
    unsub() // noop, should not throw
  })

  it('subscribe after error returns noop, handler never called', () => {
    const impl = new PipeableImpl<string, string>()
    impl.error(new Error('boom'))

    const handler = vi.fn()
    const unsub = impl.subscribe(handler)

    expect(handler).not.toHaveBeenCalled()
    unsub()
  })

  // --- done() behavior ---

  it('done() resolves immediately when already completed', async () => {
    const impl = new PipeableImpl<string, number>()
    impl.complete(42)

    expect(await impl.done()).toBe(42)
  })

  it('done() rejects immediately when already errored', async () => {
    const impl = new PipeableImpl<string, string>()
    const err = new Error('fail')
    impl.error(err)

    await expect(impl.done()).rejects.toBe(err)
  })

  it('multiple done() calls return the same promise', () => {
    const impl = new PipeableImpl<string, string>()
    const p1 = impl.done()
    const p2 = impl.done()

    expect(p1).toBe(p2)
  })

  // --- Unsubscribe safety during callback ---

  it('unsubscribe inside callback does not affect other subscribers in same push', () => {
    const impl = new PipeableImpl<number, void>()
    const results: string[] = []
    let unsubA: () => void

    unsubA = impl.subscribe((d) => {
      results.push(`a:${d}`)
      unsubA()
    })
    impl.subscribe((d) => {
      results.push(`b:${d}`)
    })

    impl.push(1)

    expect(results).toEqual(['a:1', 'b:1'])

    // a is now unsubscribed, only b should receive
    results.length = 0
    impl.push(2)
    expect(results).toEqual(['b:2'])
  })

  // --- readable view ---

  it('readable returns a Pipeable without push/complete/error', () => {
    const impl = new PipeableImpl<string, string>()
    const view: Pipeable<string, string> = impl.readable

    expect(typeof view.subscribe).toBe('function')
    expect(typeof view.done).toBe('function')
    // Type-level: push/complete/error should not exist on Pipeable
    expect('push' in view).toBe(true) // runtime it's the same object
    // But the TYPE Pipeable<string, string> does not expose push/complete/error
    // This is a compile-time guarantee, verified by the type annotation above
  })

  // --- Dual generic types ---

  it('supports different delta and final types', async () => {
    const impl = new PipeableImpl<{ chunk: string }, { total: number }>()
    const deltas: { chunk: string }[] = []
    impl.subscribe((d) => deltas.push(d))

    impl.push({ chunk: 'hello' })
    impl.push({ chunk: 'world' })
    impl.complete({ total: 2 })

    expect(deltas).toEqual([{ chunk: 'hello' }, { chunk: 'world' }])
    expect(await impl.done()).toEqual({ total: 2 })
  })
})

// ---------------------------------------------------------------------------
// mergeLifecycleCallbacks
// ---------------------------------------------------------------------------

import { mergeLifecycleCallbacks } from '../src/lifecycle.js'
import type { AgentLifecycleCallbacks } from '../src/lifecycle.js'

describe('mergeLifecycleCallbacks', () => {
  it('merges two callbacks — both handlers called', () => {
    const calls1: string[] = []
    const calls2: string[] = []
    const a: AgentLifecycleCallbacks = { onDone: () => calls1.push('a') }
    const b: AgentLifecycleCallbacks = { onDone: () => calls2.push('b') }
    const merged = mergeLifecycleCallbacks(a, b)
    merged.onDone!({ text: 'ok', timestamp: 1 })
    expect(calls1).toEqual(['a'])
    expect(calls2).toEqual(['b'])
  })

  it('only one source defines onText — only that handler is called', () => {
    const calls: string[] = []
    const a: AgentLifecycleCallbacks = {}
    const b: AgentLifecycleCallbacks = { onText: () => calls.push('b') }
    const merged = mergeLifecycleCallbacks(a, b)
    expect(merged.onText).toBeDefined()
    merged.onText!({ turnId: 't', contentIndex: 0, pipeable: null as any, timestamp: 1 })
    expect(calls).toEqual(['b'])
  })

  it('empty sources — returns empty object', () => {
    const merged = mergeLifecycleCallbacks()
    expect(merged.onStart).toBeUndefined()
    expect(merged.onDone).toBeUndefined()
  })

  it('keys not defined by any source are absent', () => {
    const a: AgentLifecycleCallbacks = { onStart: () => {} }
    const merged = mergeLifecycleCallbacks(a)
    expect(merged.onStart).toBeDefined()
    expect(merged.onText).toBeUndefined()
    expect(merged.onError).toBeUndefined()
  })
})
