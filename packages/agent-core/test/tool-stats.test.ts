import { describe, expect, it } from 'vite-plus/test'
import { ToolStatsTracker } from '../src/tool-stats.js'

describe('ToolStatsTracker', () => {
  it('records tool call successes', () => {
    const t = new ToolStatsTracker()
    t.recordToolCall('bash', false)
    t.recordToolCall('bash', false)
    const s = t.getToolStats('bash')!
    expect(s.attempts).toBe(2)
    expect(s.successes).toBe(2)
    expect(s.failures).toBe(0)
  })

  it('records tool call failures', () => {
    const t = new ToolStatsTracker()
    t.recordToolCall('file_edit', true, 'ERROR [NO_MATCH]: no match found')
    t.recordToolCall('file_edit', true, 'ERROR [MULTI_MATCH]: multiple matches')
    t.recordToolCall('file_edit', false)
    const s = t.getToolStats('file_edit')!
    expect(s.attempts).toBe(3)
    expect(s.successes).toBe(1)
    expect(s.failures).toBe(2)
    expect(s.errorCodes).toEqual({ NO_MATCH: 1, MULTI_MATCH: 1 })
  })

  it('handles failures without error code', () => {
    const t = new ToolStatsTracker()
    t.recordToolCall('bash', true, 'some random error')
    t.recordToolCall('bash', true)
    const s = t.getToolStats('bash')!
    expect(s.failures).toBe(2)
    expect(s.errorCodes).toEqual({})
  })

  it('tracks multiple tools independently', () => {
    const t = new ToolStatsTracker()
    t.recordToolCall('bash', false)
    t.recordToolCall('file_read', false)
    t.recordToolCall('file_edit', true, 'ERROR [NO_MATCH]: ...')
    expect(t.getAllToolStats().size).toBe(3)
    expect(t.getToolStats('bash')!.successes).toBe(1)
    expect(t.getToolStats('file_edit')!.failures).toBe(1)
  })

  it('records route hits', () => {
    const t = new ToolStatsTracker()
    t.recordRouteHit('rule-1', false)
    t.recordRouteHit('rule-1', false)
    t.recordRouteHit('rule-1', true)
    t.recordRouteHit('rule-2', false)
    const r1 = t.getAllRouteStats().get('rule-1')!
    expect(r1.hits).toBe(3)
    expect(r1.successes).toBe(2)
    expect(r1.failures).toBe(1)
    expect(t.getAllRouteStats().get('rule-2')!.hits).toBe(1)
  })

  it('returns undefined for unknown tool', () => {
    const t = new ToolStatsTracker()
    expect(t.getToolStats('nonexistent')).toBeUndefined()
  })

  it('exports empty snapshot without error', () => {
    const t = new ToolStatsTracker()
    const snap = t.exportSnapshot()
    expect(snap).toEqual({ tools: {}, routes: {} })
  })

  it('roundtrips through export/hydrate', () => {
    const t = new ToolStatsTracker()
    t.recordToolCall('bash', false)
    t.recordToolCall('bash', true, 'ERROR [TIMEOUT]: timed out')
    t.recordToolCall('file_edit', true, 'ERROR [NO_MATCH]: ...')
    t.recordRouteHit('rule-1', false)
    t.recordRouteHit('rule-1', true)

    const snap = t.exportSnapshot()

    const t2 = new ToolStatsTracker()
    t2.hydrateFromSnapshot(snap)

    expect(t2.getToolStats('bash')).toEqual(t.getToolStats('bash'))
    expect(t2.getToolStats('file_edit')).toEqual(t.getToolStats('file_edit'))
    expect(t2.getAllRouteStats().get('rule-1')).toEqual(t.getAllRouteStats().get('rule-1'))
  })

  it('hydrate replaces existing state', () => {
    const t = new ToolStatsTracker()
    t.recordToolCall('bash', false)
    t.hydrateFromSnapshot({ tools: {}, routes: {} })
    expect(t.getToolStats('bash')).toBeUndefined()
    expect(t.getAllToolStats().size).toBe(0)
  })
})
