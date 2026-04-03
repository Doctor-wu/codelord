import { describe, expect, it } from 'vitest'
import {
  createInitialTimelineState,
  reduceLifecycleEvent,
  captureTimelineSnapshot,
  hydrateTimelineState,
} from '../src/renderer/ink/timeline-projection.js'
import type { LifecycleEvent, AssistantReasoningState } from '@agent/core'
import { createReasoningState } from '@agent/core'

describe('Timeline snapshot: capture and hydrate', () => {
  it('captures and hydrates a timeline with user + assistant items', () => {
    let state = createInitialTimelineState()

    // Simulate a user turn
    state = reduceLifecycleEvent(state, {
      type: 'user_turn',
      id: 'user-1',
      content: 'hello',
      timestamp: 1000,
    })

    // Simulate an assistant turn
    const reasoning = createReasoningState()
    state = reduceLifecycleEvent(state, {
      type: 'assistant_turn_start',
      id: 'assistant-1',
      reasoning,
      timestamp: 1001,
    })
    state = reduceLifecycleEvent(state, {
      type: 'assistant_turn_end',
      id: 'assistant-1',
      reasoning: { ...reasoning, status: 'completed' },
      timestamp: 1002,
    })

    // Capture
    const snapshot = captureTimelineSnapshot(state)
    expect(snapshot.items).toHaveLength(2)

    // Streaming flag should be cleared in snapshot
    const assistantItem = snapshot.items.find(i => i.type === 'assistant') as any
    expect(assistantItem.isStreaming).toBe(false)

    // Hydrate into fresh state
    const hydrated = hydrateTimelineState(snapshot)
    expect(hydrated.items).toHaveLength(2)
    expect(hydrated.isRunning).toBe(false)
    expect(hydrated.isIdle).toBe(true)
    expect(hydrated._currentAssistantTurnId).toBeNull()
    expect(hydrated._currentBatchId).toBeNull()

    // Items are preserved
    expect(hydrated.items[0].type).toBe('user')
    expect(hydrated.items[1].type).toBe('assistant')
  })

  it('captures question items for waiting_user state', () => {
    let state = createInitialTimelineState()

    state = reduceLifecycleEvent(state, {
      type: 'user_turn',
      id: 'user-1',
      content: 'setup',
      timestamp: 1000,
    })

    state = reduceLifecycleEvent(state, {
      type: 'blocked_enter',
      reason: 'waiting_user',
      question: 'Which DB?',
      questionDetail: { question: 'Which DB?', whyAsk: 'Need to know', options: ['pg', 'mysql'] },
      timestamp: 1001,
    })

    const snapshot = captureTimelineSnapshot(state)
    const hydrated = hydrateTimelineState(snapshot)

    // Question item should be preserved
    const questionItem = hydrated.items.find(i => i.type === 'question') as any
    expect(questionItem).toBeDefined()
    expect(questionItem.question).toBe('Which DB?')
    expect(questionItem.detail?.options).toEqual(['pg', 'mysql'])
  })

  it('serializes to JSON and back without data loss', () => {
    let state = createInitialTimelineState()
    state = reduceLifecycleEvent(state, {
      type: 'user_turn',
      id: 'user-1',
      content: 'test',
      timestamp: 1000,
    })

    const snapshot = captureTimelineSnapshot(state)
    const json = JSON.stringify(snapshot)
    const parsed = JSON.parse(json)
    const hydrated = hydrateTimelineState(parsed)

    expect(hydrated.items).toHaveLength(1)
    expect(hydrated.items[0].type).toBe('user')
  })
})
