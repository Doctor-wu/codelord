import { describe, it, expect } from 'vitest'
import { createReasoningState, projectDisplayReason } from '../src/events.js'
import type { AssistantReasoningState } from '../src/events.js'

describe('AssistantReasoningState', () => {
  it('creates with default values', () => {
    const r = createReasoningState()
    expect(r.rawThoughtText).toBe('')
    expect(r.intent).toBeNull()
    expect(r.why).toBeNull()
    expect(r.expectedObservation).toBeNull()
    expect(r.uncertainty).toBeNull()
    expect(r.risk).toBeNull()
    expect(r.status).toBe('thinking')
  })

  it('all structured fields can be null and system still works', () => {
    const r = createReasoningState()
    // Should not throw
    const reason = projectDisplayReason(r)
    expect(reason).toBeNull()
  })

  it('rawThoughtText can be incrementally appended', () => {
    const r = createReasoningState()
    r.rawThoughtText += 'I need to '
    r.rawThoughtText += 'read the file.'
    expect(r.rawThoughtText).toBe('I need to read the file.')
  })

  it('status can transition through phases', () => {
    const r = createReasoningState()
    expect(r.status).toBe('thinking')
    r.status = 'deciding'
    expect(r.status).toBe('deciding')
    r.status = 'acting'
    expect(r.status).toBe('acting')
    r.status = 'completed'
    expect(r.status).toBe('completed')
  })
})

describe('projectDisplayReason', () => {
  it('returns why if available', () => {
    const r: AssistantReasoningState = {
      ...createReasoningState(),
      why: 'Need to check the config',
      intent: 'Read config file',
    }
    expect(projectDisplayReason(r)).toBe('Need to check the config')
  })

  it('falls back to intent if why is null', () => {
    const r: AssistantReasoningState = {
      ...createReasoningState(),
      intent: 'Read config file',
    }
    expect(projectDisplayReason(r)).toBe('Read config file')
  })

  it('falls back to first sentence of rawThoughtText', () => {
    const r: AssistantReasoningState = {
      ...createReasoningState(),
      rawThoughtText: 'I should read the config file. Then check the tests.',
    }
    expect(projectDisplayReason(r)).toBe('I should read the config file.')
  })

  it('truncates long rawThoughtText', () => {
    const r: AssistantReasoningState = {
      ...createReasoningState(),
      rawThoughtText: 'x'.repeat(200),
    }
    const reason = projectDisplayReason(r)!
    expect(reason.length).toBeLessThanOrEqual(101) // 100 + ellipsis
    expect(reason.endsWith('…')).toBe(true)
  })

  it('returns null when everything is empty', () => {
    expect(projectDisplayReason(createReasoningState())).toBeNull()
  })
})
