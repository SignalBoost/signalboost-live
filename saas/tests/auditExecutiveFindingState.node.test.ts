import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  isHandled,
  overlayFindingStates,
  type FindingStateMap,
} from '../lib/audit/findingState.ts'

type TestFinding = {
  id: string
  status: string
  owner?: string
  dueDate?: string
  evidenceRequired: boolean
}

test('persisted handled state is overlaid without mutating deterministic findings', () => {
  const original: TestFinding[] = [
    { id: 'finding-1', status: 'open', evidenceRequired: false },
    { id: 'finding-2', status: 'open', evidenceRequired: false },
  ]
  const states: FindingStateMap = {
    'finding-1': {
      status: 'resolved',
      owner: 'owner',
      note: 'verified fixed',
      dueDate: '2026-07-19',
    },
  }

  const overlaid = overlayFindingStates(original, states)

  assert.equal(original[0].status, 'open', 'overlay must not mutate deterministic input')
  assert.equal(overlaid[0].status, 'resolved')
  assert.equal(overlaid[0].owner, 'owner')
  assert.equal(overlaid[0].dueDate, '2026-07-19')
  assert.equal(overlaid[1], original[1], 'findings without saved state remain unchanged')
  assert.equal(isHandled(overlaid[0].status), true)
})

test('in-progress findings remain actionable while handled statuses do not', () => {
  for (const status of ['resolved', 'accepted', 'wont_fix']) assert.equal(isHandled(status), true)
  assert.equal(isHandled('in_progress'), false)
  assert.equal(isHandled('open'), false)
})

test('executive summary overlays state before scoring and active-risk selection', () => {
  const source = readFileSync(new URL('../lib/audit/execSummary.ts', import.meta.url), 'utf8')
  const overlayAt = source.indexOf('const findings = overlayFindingStates(')
  const scoreAt = source.indexOf('const score = scoreFromFindings(findings)')

  assert.ok(overlayAt >= 0, 'executive summary must overlay persisted states')
  assert.ok(scoreAt > overlayAt, 'scoring must happen after persisted-state overlay')
  assert.match(source, /\.filter\(f => !f\.evidenceRequired && !isHandled\(f\.status\)\)/)
})

test('executive route loads audit_finding_state and passes it into the summary', () => {
  const source = readFileSync(new URL('../app/api/hub/audit/executive-summary/route.ts', import.meta.url), 'utf8')
  assert.match(source, /from\('audit_finding_state'\)/)
  assert.match(source, /states = indexStates\(/)
  assert.match(source, /buildExecutiveSummary\(snapshot, \{ states \}\)/)
})
