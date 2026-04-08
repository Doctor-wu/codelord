import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { SessionStore } from '../src/session-store.js'
import type { SessionSnapshot } from '@agent/core'
import type { TimelineSnapshot } from '../src/renderer/ink/timeline-projection.js'

function makeTmpDir(): string {
  const dir = join(tmpdir(), `codelord-test-${randomUUID()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function makeSnapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    version: 1,
    sessionId: randomUUID(),
    createdAt: Date.now() - 10000,
    updatedAt: Date.now(),
    cwd: '/tmp/project',
    provider: 'openai',
    model: 'gpt-4',
    gitBranch: null,
    runtimeState: 'READY',
    wasInFlight: false,
    messages: [{ role: 'user', content: 'hello', timestamp: Date.now() }],
    pendingInbound: [],
    pendingQuestion: null,
    resolvedQuestions: [],
    lastOutcome: { type: 'success', text: 'ok' },
    routeRecords: [],
    safetyRecords: [],
    sessionStepCount: 1,
    checkpoints: [],
    usageAggregate: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }, llmCalls: 0, lastCall: null },
    ...overrides,
  }
}

function makeTimeline(): TimelineSnapshot {
  return {
    items: [
      { type: 'user', id: 'u-1', content: 'hello', timestamp: Date.now() },
    ],
    startTime: Date.now(),
    _nextId: 1,
  }
}

describe('SessionStore', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs) {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
    }
    dirs.length = 0
  })

  function createStore(): SessionStore {
    const dir = makeTmpDir()
    dirs.push(dir)
    return new SessionStore(dir)
  }

  // --- Basic save/load ---

  it('saves and loads a snapshot', () => {
    const store = createStore()
    const snapshot = makeSnapshot()

    store.save(snapshot)

    const loaded = store.loadSnapshot(snapshot.sessionId)
    expect(loaded).not.toBeNull()
    expect(loaded!.sessionId).toBe(snapshot.sessionId)
    expect(loaded!.messages).toHaveLength(1)
    expect(loaded!.runtimeState).toBe('READY')
  })

  it('saves and loads timeline', () => {
    const store = createStore()
    const snapshot = makeSnapshot()
    const timeline = makeTimeline()

    store.save(snapshot, timeline)

    const loaded = store.loadTimeline(snapshot.sessionId)
    expect(loaded).not.toBeNull()
    expect(loaded!.items).toHaveLength(1)
    expect(loaded!.items[0].type).toBe('user')
  })

  it('saves and loads meta', () => {
    const store = createStore()
    const snapshot = makeSnapshot({ pendingInbound: [{ role: 'user', content: 'q', timestamp: 0 }] })

    store.save(snapshot)

    const meta = store.loadMeta(snapshot.sessionId)
    expect(meta).not.toBeNull()
    expect(meta!.sessionId).toBe(snapshot.sessionId)
    expect(meta!.messageCount).toBe(1)
    expect(meta!.pendingInboundCount).toBe(1)
  })

  // --- findResumable (by cwd) ---

  it('finds the most recent resumable session for a cwd', () => {
    const store = createStore()
    const old = makeSnapshot({ cwd: '/tmp/project', updatedAt: 1000 })
    const recent = makeSnapshot({ cwd: '/tmp/project', updatedAt: 2000 })
    const other = makeSnapshot({ cwd: '/tmp/other', updatedAt: 3000 })

    store.save(old)
    store.save(recent)
    store.save(other)

    const found = store.findResumable('/tmp/project')
    expect(found).not.toBeNull()
    expect(found!.sessionId).toBe(recent.sessionId)
  })

  it('returns null when no resumable session exists', () => {
    const store = createStore()
    expect(store.findResumable('/nonexistent')).toBeNull()
  })

  it('skips sessions with no messages', () => {
    const store = createStore()
    const empty = makeSnapshot({ cwd: '/tmp/project', messages: [] })
    store.save(empty)

    expect(store.findResumable('/tmp/project')).toBeNull()
  })

  // --- findLatest (cross-cwd) ---

  it('findLatest returns the most recent session regardless of cwd', () => {
    const store = createStore()
    const s1 = makeSnapshot({ cwd: '/tmp/a', updatedAt: 1000 })
    const s2 = makeSnapshot({ cwd: '/tmp/b', updatedAt: 3000 })
    const s3 = makeSnapshot({ cwd: '/tmp/c', updatedAt: 2000 })

    store.save(s1)
    store.save(s2)
    store.save(s3)

    const found = store.findLatest()
    expect(found).not.toBeNull()
    expect(found!.sessionId).toBe(s2.sessionId)
  })

  it('findLatest returns null when no sessions exist', () => {
    const store = createStore()
    expect(store.findLatest()).toBeNull()
  })

  it('findLatest skips empty sessions', () => {
    const store = createStore()
    const empty = makeSnapshot({ messages: [] })
    store.save(empty)

    expect(store.findLatest()).toBeNull()
  })

  // --- Default new session (no auto-resume) ---

  it('default startup creates new session — store has sessions but caller does not auto-resume', () => {
    const store = createStore()
    const existing = makeSnapshot({ cwd: '/tmp/project' })
    store.save(existing)

    // Default behavior: always create new session ID
    const newId = store.newSessionId()
    expect(newId).not.toBe(existing.sessionId)
  })

  // --- --resume <id> ---

  it('--resume <id>: loadMeta returns the session for a known id', () => {
    const store = createStore()
    const snapshot = makeSnapshot()
    store.save(snapshot)

    const meta = store.loadMeta(snapshot.sessionId)
    expect(meta).not.toBeNull()
    expect(meta!.sessionId).toBe(snapshot.sessionId)
  })

  it('--resume <id>: loadMeta returns null for unknown id', () => {
    const store = createStore()
    expect(store.loadMeta('nonexistent-id')).toBeNull()
  })

  // --- sessions command ---

  it('listAll returns sessions for display', () => {
    const store = createStore()
    const s1 = makeSnapshot({ updatedAt: 1000, cwd: '/a' })
    const s2 = makeSnapshot({ updatedAt: 3000, cwd: '/b', wasInFlight: true, runtimeState: 'STREAMING' })
    const s3 = makeSnapshot({ updatedAt: 2000, cwd: '/c' })

    store.save(s1)
    store.save(s2)
    store.save(s3)

    const all = store.listAll()
    expect(all).toHaveLength(3)
    // Sorted by updatedAt descending
    expect(all[0].sessionId).toBe(s2.sessionId)
    expect(all[1].sessionId).toBe(s3.sessionId)
    expect(all[2].sessionId).toBe(s1.sessionId)
    // Meta includes wasInFlight info
    expect(all[0].wasInFlight).toBe(true)
    expect(all[0].runtimeState).toBe('STREAMING')
  })

  // --- delete ---

  it('deletes a session', () => {
    const store = createStore()
    const snapshot = makeSnapshot()
    store.save(snapshot)

    expect(store.loadSnapshot(snapshot.sessionId)).not.toBeNull()

    store.delete(snapshot.sessionId)
    expect(store.loadSnapshot(snapshot.sessionId)).toBeNull()
  })

  // --- Edge cases ---

  it('returns null for non-existent session', () => {
    const store = createStore()
    expect(store.loadSnapshot('nonexistent')).toBeNull()
    expect(store.loadTimeline('nonexistent')).toBeNull()
    expect(store.loadMeta('nonexistent')).toBeNull()
  })

  it('overwrites existing session on re-save', () => {
    const store = createStore()
    const snapshot = makeSnapshot()
    store.save(snapshot)

    const updated = { ...snapshot, updatedAt: Date.now() + 5000, sessionStepCount: 10 }
    store.save(updated)

    const loaded = store.loadSnapshot(snapshot.sessionId)
    expect(loaded!.sessionStepCount).toBe(10)
  })
})
