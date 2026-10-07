// saas/tests/cosUniversityLineWorkingCosExclusion.node.test.ts
//
// Production 2026-10-07: working-cos:d1be42c9 sat at evaluation_pending from 2026-10-03 19:03 and made
// INDEPENDENT_EVALUATION read as stopped for ~100 hours. Working-COS is a separate owner-dispatched program with no
// University exam worker (ONBOARD: "not part of the assembly line"). The line, its observation and its controller count
// only University units; a stuck University unit still stops the line exactly as before.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { observeLine } from '../lib/ai/cos/cosUniversityLineObservation.ts'
import { WORKING_STATIONS, isAssemblyLineCandidate } from '../lib/ai/cos/cosUniversityAssemblyLine.ts'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')
const H = (c: string) => c.repeat(64)
const NOW = new Date('2026-10-07T23:13:00Z')
const evaluation = WORKING_STATIONS.find(station => String(station.id) === 'INDEPENDENT_EVALUATION')!

test('a Working-COS candidate is not a unit of the University line; every other candidate is', () => {
  assert.equal(isAssemblyLineCandidate('working-cos:d1be42c94d892b75bf272e3a34ad0000'), false)
  assert.equal(isAssemblyLineCandidate('WORKING-COS:abc'), false)
  assert.equal(isAssemblyLineCandidate('mass:f5dbf87c-3fb5-46d0-95ff-6334a07f0c5'), true)
  assert.equal(isAssemblyLineCandidate('study-plan:1'), true)
})

test('a stranded Working-COS artifact no longer stops INDEPENDENT_EVALUATION, a stranded University unit still does', () => {
  const working = { candidate_id: 'working-cos:d1be42c94d892b75bf272e3a34ad0000', trained_artifact_hash: H('d'), status: evaluation.sourceStatus, updated_at: '2026-10-03T19:03:04Z' }
  const ledgerFor = (id: string, at: string) => ({ candidate_id: id, station: evaluation.id, stage_entered_at: at, last_transition_at: at, terminal: false })

  const onlyWorking = observeLine({ now: NOW, artifacts: [working], ledger: [ledgerFor(working.candidate_id, working.updated_at)] })
  assert.equal(onlyWorking.units.length, 0)
  assert.ok(!onlyWorking.lineStops.some(stop => String((stop as any).station) === 'INDEPENDENT_EVALUATION'))

  const mass = { candidate_id: 'mass:a', trained_artifact_hash: H('a'), status: evaluation.sourceStatus, updated_at: '2026-10-03T19:03:04Z' }
  const both = observeLine({ now: NOW, artifacts: [working, mass], ledger: [ledgerFor(working.candidate_id, working.updated_at), ledgerFor('mass:a', mass.updated_at)] })
  assert.deepEqual(both.units.map(unit => unit.candidateId), ['mass:a'])
  assert.ok(both.lineStops.some(stop => String((stop as any).station) === 'INDEPENDENT_EVALUATION'), 'a real stuck University unit still stops the line')
})

test('the lifecycle controller skips Working-COS candidates before planning any action', () => {
  const route = read('../app/api/cron/cos-university-lifecycle-orchestrator/route.ts')
  assert.match(route, /if \(!isAssemblyLineCandidate\(artifact\.candidateId\)\) continue/)
})
