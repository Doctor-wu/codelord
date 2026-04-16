import { describe, it, expect } from 'vite-plus/test'
import { createReasoningState, projectDisplayReason } from '../src/events.js'
import type { AssistantReasoningState } from '../src/events.js'
import { ReasoningManager, resolveReasoningVisibility, sanitizeDisplayReason } from '../src/reasoning-manager.js'
import type { ReasoningLevel } from '../src/reasoning-manager.js'

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

// ---------------------------------------------------------------------------
// extractStructuredReasoning (via ReasoningManager.endTurn)
// ---------------------------------------------------------------------------

describe('extractStructuredReasoning', () => {
  it('extracts intent from "I need to..." pattern', () => {
    const mgr = new ReasoningManager('high')
    mgr.beginTurn()
    mgr.appendThought('I need to read the file to understand the structure.')
    mgr.endTurn()
    expect(mgr.current!.intent).toBe('I need to read the file to understand the structure.')
  })

  it('extracts intent from "Let me..." pattern', () => {
    const mgr = new ReasoningManager('high')
    mgr.beginTurn()
    mgr.appendThought('Let me check the test output first.')
    mgr.endTurn()
    expect(mgr.current!.intent).toBe('Let me check the test output first.')
  })

  it('extracts why from "because..." pattern', () => {
    const mgr = new ReasoningManager('high')
    mgr.beginTurn()
    mgr.appendThought('I should fix this because the test is failing on CI.')
    mgr.endTurn()
    expect(mgr.current!.why).toBe('because the test is failing on CI.')
  })

  it('extracts uncertainty from "not sure" pattern', () => {
    const mgr = new ReasoningManager('high')
    mgr.beginTurn()
    mgr.appendThought("I'm not sure if this approach will work with the current config.")
    mgr.endTurn()
    expect(mgr.current!.uncertainty).toContain('not sure')
  })

  it('extracts risk from "could break" pattern', () => {
    const mgr = new ReasoningManager('high')
    mgr.beginTurn()
    mgr.appendThought('This change could break the existing tests if not careful.')
    mgr.endTurn()
    expect(mgr.current!.risk).toContain('could break')
  })

  it('extracts expectedObservation from "should show" pattern', () => {
    const mgr = new ReasoningManager('high')
    mgr.beginTurn()
    mgr.appendThought('Running the test should show a green checkmark.')
    mgr.endTurn()
    expect(mgr.current!.expectedObservation).toContain('should show')
  })

  it('returns null for fields with no matching pattern', () => {
    const mgr = new ReasoningManager('high')
    mgr.beginTurn()
    mgr.appendThought('The code looks fine overall.')
    mgr.endTurn()
    expect(mgr.current!.intent).toBeNull()
    expect(mgr.current!.why).toBeNull()
    expect(mgr.current!.uncertainty).toBeNull()
    expect(mgr.current!.risk).toBeNull()
    expect(mgr.current!.expectedObservation).toBeNull()
  })

  it('truncates fields longer than 120 chars', () => {
    const mgr = new ReasoningManager('high')
    mgr.beginTurn()
    mgr.appendThought('I need to ' + 'x'.repeat(200))
    mgr.endTurn()
    expect(mgr.current!.intent!.length).toBeLessThanOrEqual(120)
  })

  it('does not overwrite pre-existing fields', () => {
    const mgr = new ReasoningManager('high')
    mgr.beginTurn()
    mgr.current!.intent = 'Pre-set intent'
    mgr.appendThought('I need to do something else.')
    mgr.endTurn()
    expect(mgr.current!.intent).toBe('Pre-set intent')
  })

  it('handles empty rawThoughtText gracefully', () => {
    const mgr = new ReasoningManager('high')
    mgr.beginTurn()
    mgr.endTurn()
    expect(mgr.current!.intent).toBeNull()
    expect(mgr.current!.status).toBe('completed')
  })
})

// ---------------------------------------------------------------------------
// sanitizeDisplayReason
// ---------------------------------------------------------------------------

describe('sanitizeDisplayReason', () => {
  it('returns clean single-line text', () => {
    expect(sanitizeDisplayReason('Read the config file')).toBe('Read the config file')
  })

  it('collapses newlines to spaces', () => {
    expect(sanitizeDisplayReason('Read the\nconfig file')).toBe('Read the config file')
  })

  it('takes only the first sentence', () => {
    expect(sanitizeDisplayReason('Read the file. Then check tests.')).toBe('Read the file.')
  })

  it('truncates to 80 chars', () => {
    const long = 'x'.repeat(100)
    const result = sanitizeDisplayReason(long)
    expect(result.length).toBeLessThanOrEqual(80)
    expect(result.endsWith('...')).toBe(true)
  })

  it('trims whitespace', () => {
    expect(sanitizeDisplayReason('  hello world  ')).toBe('hello world')
  })
})

// ---------------------------------------------------------------------------
// resolveReasoningVisibility
// ---------------------------------------------------------------------------

describe('resolveReasoningVisibility', () => {
  it('off: nothing visible', () => {
    const v = resolveReasoningVisibility('off')
    expect(v).toEqual({ showThoughtViewport: false, showReasoningSummary: false, showToolReason: false })
  })

  it('minimal: only tool reason', () => {
    const v = resolveReasoningVisibility('minimal')
    expect(v).toEqual({ showThoughtViewport: false, showReasoningSummary: false, showToolReason: true })
  })

  it('low: tool reason + summary', () => {
    const v = resolveReasoningVisibility('low')
    expect(v).toEqual({ showThoughtViewport: false, showReasoningSummary: true, showToolReason: true })
  })

  it('medium: tool reason + summary', () => {
    const v = resolveReasoningVisibility('medium')
    expect(v).toEqual({ showThoughtViewport: false, showReasoningSummary: true, showToolReason: true })
  })

  it('high: everything visible', () => {
    const v = resolveReasoningVisibility('high')
    expect(v).toEqual({ showThoughtViewport: true, showReasoningSummary: true, showToolReason: true })
  })

  it('xhigh: everything visible', () => {
    const v = resolveReasoningVisibility('xhigh')
    expect(v).toEqual({ showThoughtViewport: true, showReasoningSummary: true, showToolReason: true })
  })

  it('covers all ReasoningLevel values', () => {
    const levels: ReasoningLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh']
    for (const level of levels) {
      const v = resolveReasoningVisibility(level)
      expect(v).toHaveProperty('showThoughtViewport')
      expect(v).toHaveProperty('showReasoningSummary')
      expect(v).toHaveProperty('showToolReason')
    }
  })
})
