import test from 'node:test'
import assert from 'node:assert/strict'
import { buildExecutiveSummary } from '../lib/audit/execSummary.ts'
import type { AuditSnapshot } from '../lib/audit/findingsEngine.ts'
import type { FindingStateMap } from '../lib/audit/findingState.ts'

test('executive summary overlays persisted handled state before scoring and consent counts', () => {
  const snapshot: AuditSnapshot = {
    providers: [{ id: 'stripe', status: 'error', category: 'billing' }],
  }

  const initial = buildExecutiveSummary(snapshot)
  const target = initial.findings.find(f => f.provider === 'stripe' && f.category === 'inventory')
  assert.ok(target, 'expected deterministic provider-error finding')
  assert.equal(target.status, 'open')
  assert.ok(initial.topRisks.some(f => f.id === target.id))

  const states: FindingStateMap = {
    [target.id]: {
      status: 'resolved',
      owner: 'owner',
      note: 'verified fixed',
      dueDate: '2026-07-19',
    },
  }
  const handled = buildExecutiveSummary(snapshot, { states })
  const overlaid = handled.findings.find(f => f.id === target.id)

  assert.equal(overlaid?.status, 'resolved')
  assert.equal(overlaid?.owner, 'owner')
  assert.equal(overlaid?.dueDate, '2026-07-19')
  assert.ok(!handled.topRisks.some(f => f.id === target.id), 'handled finding must leave active top risks')
  assert.ok(handled.score.score >= initial.score.score, 'handled finding must not continue lowering readiness')
})

test('in-progress findings remain actionable', () => {
  const snapshot: AuditSnapshot = {
    providers: [{ id: 'github', status: 'error', category: 'source-control' }],
  }
  const initial = buildExecutiveSummary(snapshot)
  const target = initial.findings.find(f => f.provider === 'github' && f.category === 'inventory')
  assert.ok(target)

  const states: FindingStateMap = {
    [target.id]: { status: 'in_progress', owner: '', note: '', dueDate: '' },
  }
  const summary = buildExecutiveSummary(snapshot, { states })

  assert.equal(summary.findings.find(f => f.id === target.id)?.status, 'in_progress')
  assert.ok(summary.topRisks.some(f => f.id === target.id), 'in-progress finding must remain actionable')
})
