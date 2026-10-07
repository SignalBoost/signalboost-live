// saas/tests/cosUniversityLineNowReport.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describeLineObservation, observeLine } from '../lib/ai/cos/cosUniversityLineObservation.ts'
import { WORKING_STATIONS } from '../lib/ai/cos/cosUniversityAssemblyLine.ts'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')
const H = (c: string) => c.repeat(64)
const NOW = new Date('2026-10-07T16:00:00Z')
const evaluation = WORKING_STATIONS.find(station => String(station.id) === 'INDEPENDENT_EVALUATION')!

test('the Step 1 report shows each station, its oldest wait and any station idle past its SLA', () => {
  // The shape seen on 2026-10-07: units waiting at the exam station, nothing leased, no output for ~4 hours.
  const observation = observeLine({
    now: NOW,
    artifacts: [
      { candidate_id: 'mass:a', trained_artifact_hash: H('a'), status: evaluation.sourceStatus, updated_at: '2026-10-07T12:00:00Z' },
      { candidate_id: 'mass:b', trained_artifact_hash: H('b'), status: evaluation.sourceStatus, updated_at: '2026-10-07T13:30:00Z' },
    ],
    ledger: [
      { candidate_id: 'mass:a', station: evaluation.id, stage_entered_at: '2026-10-07T12:00:00Z', last_transition_at: '2026-10-07T12:00:00Z', terminal: false },
      { candidate_id: 'mass:b', station: evaluation.id, stage_entered_at: '2026-10-07T13:30:00Z', last_transition_at: '2026-10-07T13:30:00Z', terminal: false },
    ],
  })
  const text = describeLineObservation({ at: NOW.toISOString(), paused: false, windowComplete: true, observation })
  console.log(text)
  assert.match(text, /^LINE NOW at 2026-10-07T16:00:00\.000Z: units=2 ledgerDisagreements=0 ledgerMissing=0/)
  assert.match(text, /INDEPENDENT_EVALUATION \([a-z_]+\) :: waiting=2 inFlight=0 oldestWaitingMin=240 slaMin=\d+/)
  for (const station of WORKING_STATIONS) assert.ok(text.includes(`  ${station.id} (`), `every working station is listed: ${station.id}`)
  if (evaluation.stationSlaSeconds < 9000) assert.match(text, /stopped \(idle past SLA\): INDEPENDENT_EVALUATION waiting=2 idleMin=150/)
  assert.doesNotMatch(text, /mass:a|aaaaaaaa/, 'no candidate ids or artifact hashes')
})

test('a paused line says so instead of looking empty', () => {
  assert.match(describeLineObservation({ at: NOW.toISOString(), paused: true }), /PAUSED by the line pause setting/)
  assert.match(describeLineObservation({ at: NOW.toISOString(), paused: false, observation: null }), /not observed/)
})

test('the read-only route returns the summary and the Step 1 report publishes it', () => {
  const route = read('../app/api/cron/cos-university-line-observation/route.ts')
  assert.match(route, /summary: describeLineObservation\(\{ at: now\.toISOString\(\), paused: true \}\)/)
  assert.match(route, /summary: describeLineObservation\(\{ at: now\.toISOString\(\), paused: false, windowComplete: artifacts\.length < MAX_ARTIFACTS, observation \}\)/)
  assert.match(route, /const db = readOnlyDb\(service\)/, 'still read only by construction')
  const workflow = read('../../.github/workflows/assembly-line-live-proof.yml')
  assert.match(workflow, /name: Read the line now \(read only\)/)
  assert.match(workflow, /\/api\/cron\/cos-university-line-observation/)
  assert.match(workflow, /echo "## Line now"/)
})
