import { describe, expect, it } from 'vitest'
import {
  createInitialTimelineState,
  reduceLifecycleEvent,
  captureTimelineSnapshot,
  reconcileTimelineForResume,
} from '../src/renderer/ink/timeline-projection.js'
import type { TimelineState, QuestionItem, StatusItem, TimelineSnapshot } from '../src/renderer/ink/timeline-projection.js'
import type { SessionSnapshot, PendingQuestion } from '@agent/core'
import { createReasoningState, createUsageAggregate } from '@agent/core'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    version: 1,
    sessionId: 'sess-1',
    createdAt: 1000,
    updatedAt: 2000,
    cwd: '/tmp',
    provider: 'test',
    model: 'test',
    runtimeState: 'READY',
    wasInFlight: false,
    messages: [{ role: 'user', content: 'hi', timestamp: 1000 }],
    pendingInbound: [],
    pendingQuestion: null,
    resolvedQuestions: [],
    lastOutcome: null,
    routeRecords: [],
    safetyRecords: [],
    sessionStepCount: 1,
    checkpoints: [],
    usageAggregate: createUsageAggregate(),
    ...overrides,
  }
}

const testQuestion: PendingQuestion = {
  toolCallId: 'tc-1',
  question: 'Which DB?',
  whyAsk: 'Need to know',
  expectedAnswerFormat: 'postgres or mysql',
  defaultPlanIfNoAnswer: 'Will use postgres',
  options: ['postgres', 'mysql'],
  askedAt: 1500,
}

function makeTimelineWithQuestion(): TimelineSnapshot {
  let state = createInitialTimelineState()
  state = reduceLifecycleEvent(state, { type: 'user_turn', id: 'u1', content: 'hi', timestamp: 1000 })
  state = reduceLifecycleEvent(state, {
    type: 'blocked_enter',
    reason: 'waiting_user',
    question: 'Which DB?',
    questionDetail: { question: 'Which DB?', whyAsk: 'Need to know', options: ['postgres', 'mysql'] },
    timestamp: 1500,
  })
  return captureTimelineSnapshot(state)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('reconcileTimelineForResume', () => {
  // --- Scenario A: resume waiting_user without timeline ---

  it('restores question card from snapshot even without timeline cache', () => {
    const snapshot = makeSnapshot({
      runtimeState: 'BLOCKED',
      pendingQuestion: testQuestion,
    })

    const state = reconcileTimelineForResume(null, {
      snapshot,
      wasDowngraded: false,
      interruptedDuring: null,
    })

    const lastItem = state.items[state.items.length - 1]
    expect(lastItem?.type).toBe('question')
    const q = lastItem as QuestionItem
    expect(q.question).toBe('Which DB?')
    expect(q.detail?.whyAsk).toBe('Need to know')
    expect(q.detail?.options).toEqual(['postgres', 'mysql'])
    expect(q.detail?.expectedAnswerFormat).toBe('postgres or mysql')
    expect(q.detail?.defaultPlanIfNoAnswer).toBe('Will use postgres')
  })

  // --- Scenario A: resume waiting_user with timeline ---

  it('keeps existing question from timeline when it matches snapshot', () => {
    const snapshot = makeSnapshot({
      runtimeState: 'BLOCKED',
      pendingQuestion: testQuestion,
    })
    const timeline = makeTimelineWithQuestion()

    const state = reconcileTimelineForResume(timeline, {
      snapshot,
      wasDowngraded: false,
      interruptedDuring: null,
    })

    // Should have exactly one question item (from timeline), not duplicated
    const questions = state.items.filter(i => i.type === 'question')
    expect(questions).toHaveLength(1)
  })

  // --- Scenario B: resume interrupted/downgraded — no status item injected ---

  it('does not inject interrupted status item on downgraded resume', () => {
    const snapshot = makeSnapshot({
      runtimeState: 'STREAMING',
      wasInFlight: true,
    })

    const state = reconcileTimelineForResume(null, {
      snapshot,
      wasDowngraded: true,
      interruptedDuring: 'STREAMING',
    })

    const interrupts = state.items.filter(i => i.type === 'status' && (i as StatusItem).status === 'interrupted')
    expect(interrupts).toHaveLength(0)
  })

  // --- Scenario C: resume with pending queue ---

  it('preserves pending queue info from snapshot (queue is in runtime, not timeline)', () => {
    const snapshot = makeSnapshot({
      pendingInbound: [
        { role: 'user', content: 'queued-1', timestamp: 1100 },
        { role: 'user', content: 'queued-2', timestamp: 1200 },
      ],
    })

    // Queue is in runtime, not in timeline items — reconciliation doesn't add queue items
    // But it must not break anything. The REPL passes queueInfo() to renderer separately.
    const state = reconcileTimelineForResume(null, {
      snapshot,
      wasDowngraded: false,
      interruptedDuring: null,
    })

    // Timeline should be valid (no crash, no stale items)
    expect(state.isRunning).toBe(false)
    expect(state.isIdle).toBe(true)
  })

  // --- Scenario D: timeline has stale question but runtime has no pending question ---

  it('removes stale question when runtime has no pending question', () => {
    const snapshot = makeSnapshot({
      runtimeState: 'READY',
      pendingQuestion: null,
    })
    const timeline = makeTimelineWithQuestion()

    const state = reconcileTimelineForResume(timeline, {
      snapshot,
      wasDowngraded: false,
      interruptedDuring: null,
    })

    const questions = state.items.filter(i => i.type === 'question')
    expect(questions).toHaveLength(0)
  })

  // --- Telemetry preservation ---

  it('preserves usage from snapshot when timeline has none', () => {
    const usage = { ...createUsageAggregate(), totalTokens: 500, llmCalls: 3 }
    const snapshot = makeSnapshot({ usageAggregate: usage })

    const state = reconcileTimelineForResume(null, {
      snapshot,
      wasDowngraded: false,
      interruptedDuring: null,
    })

    expect(state.usage?.totalTokens).toBe(500)
  })

  it('preserves stepCount from snapshot when timeline has none', () => {
    const snapshot = makeSnapshot({ sessionStepCount: 7 })

    const state = reconcileTimelineForResume(null, {
      snapshot,
      wasDowngraded: false,
      interruptedDuring: null,
    })

    expect(state.stepCount).toBe(7)
  })

  // --- Resume context population ---

  it('populates resumeContext with pending question info', () => {
    const snapshot = makeSnapshot({
      runtimeState: 'BLOCKED',
      pendingQuestion: testQuestion,
    })

    const state = reconcileTimelineForResume(null, {
      snapshot,
      wasDowngraded: false,
      interruptedDuring: null,
    })

    expect(state.resumeContext).not.toBeNull()
    expect(state.resumeContext!.isResumed).toBe(true)
    expect(state.resumeContext!.hasPendingQuestion).toBe(true)
    expect(state.resumeContext!.wasDowngraded).toBe(false)
  })

  it('populates resumeContext with downgrade info', () => {
    const snapshot = makeSnapshot({
      runtimeState: 'STREAMING',
      wasInFlight: true,
    })

    const state = reconcileTimelineForResume(null, {
      snapshot,
      wasDowngraded: true,
      interruptedDuring: 'STREAMING',
    })

    expect(state.resumeContext).not.toBeNull()
    expect(state.resumeContext!.wasDowngraded).toBe(true)
    expect(state.resumeContext!.interruptedDuring).toBe('STREAMING')
    expect(state.resumeContext!.hasPendingQuestion).toBe(false)
  })

  it('populates resumeContext with pending inbound count', () => {
    const snapshot = makeSnapshot({
      pendingInbound: [
        { role: 'user', content: 'queued-1', timestamp: 1100 },
        { role: 'user', content: 'queued-2', timestamp: 1200 },
      ],
    })

    const state = reconcileTimelineForResume(null, {
      snapshot,
      wasDowngraded: false,
      interruptedDuring: null,
    })

    expect(state.resumeContext!.pendingInboundCount).toBe(2)
  })

  it('normal resume has resumeContext.isResumed = true with no special flags', () => {
    const snapshot = makeSnapshot()

    const state = reconcileTimelineForResume(null, {
      snapshot,
      wasDowngraded: false,
      interruptedDuring: null,
    })

    expect(state.resumeContext!.isResumed).toBe(true)
    expect(state.resumeContext!.hasPendingQuestion).toBe(false)
    expect(state.resumeContext!.wasDowngraded).toBe(false)
    expect(state.resumeContext!.pendingInboundCount).toBe(0)
  })
})
