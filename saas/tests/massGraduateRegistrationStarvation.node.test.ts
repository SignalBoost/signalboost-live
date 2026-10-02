//
// Production 2026-09-29: an artifact sat at `runtime_pending` for DAYS while newer artifacts registered past it.
// registerNextMassGraduate read every candidate's evidence in one query -
//   .in('candidate_id', <up to 50 ids>).order('observed_at', desc).limit(3000)
// - while decideMassGraduateRegistration walks the artifacts created_at ASCENDING, oldest first. A newest-first
// cap truncates from the OLDEST end, so the artifact checked FIRST is the one whose independent_evaluation
// verdict is most likely to fall outside the window. It was skipped as `independent_verdict_missing` on every
// tick, and `reason` is a single variable overwritten by every later artifact, so the recorded reason named the
// LAST artifact checked and never the stuck one.
//
// Two invariants are guarded here: evidence is read per artifact so no artifact can be starved by another's
// event volume, and every skip is reported by candidate id so a held artifact names itself.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  decideMassGraduateRegistration,
  type MassGraduateArtifact,
  type MassGraduateEvent,
} from '../lib/ai/cos/cosUniversityMassGraduateRegistration.ts'

const source = readFileSync(
  new URL('../app/api/cron/cos-university-graduate-activation/route.ts', import.meta.url), 'utf8')

const registerFn = (() => {
  const start = source.indexOf('async function registerNextMassGraduate()')
  const end = source.indexOf('async function proveNextGraduateRollback()')
  assert.ok(start > 0 && end > start, 'registerNextMassGraduate is no longer in this route')
  return source.slice(start, end)
})()

test('evidence is read per artifact, never as one bulk fetch across candidates', () => {
  // The exact shape that starved the oldest artifact. If it returns, so does the defect.
  assert.doesNotMatch(registerFn, /\.in\('candidate_id', candidateIds\)[\s\S]{0,200}?limit\(3000\)/,
    'the bulk 3000-row evidence fetch is back')
  assert.ok(!registerFn.includes('.limit(3000)'), 'no evidence read may be capped across candidates')

  // Scoped to ONE candidate per read.
  assert.match(registerFn, /\.eq\('event_type', 'fine_tune'\)\s*\n\s*\.eq\('candidate_id', artifact\.candidateId\)/)
  assert.match(registerFn, /\.limit\(MASS_GRADUATE_EVIDENCE_ROW_LIMIT\)/)
  assert.match(source, /const MASS_GRADUATE_EVIDENCE_ROW_LIMIT = 400\b/)

  // Bounded work per tick: the scan cannot grow with the queue.
  assert.match(source, /const MASS_GRADUATE_REGISTRATION_SCAN_LIMIT = 10\b/)
  assert.match(registerFn, /waiting\.slice\(0, MASS_GRADUATE_REGISTRATION_SCAN_LIMIT\)/)
})

test('already-registered graduates are filtered out before any evidence is read', () => {
  // Otherwise an activated graduate keeps consuming the evidence budget of an artifact still waiting for one.
  const registryFilter = registerFn.indexOf('const waiting = (artifacts.data || [])')
  const evidenceRead = registerFn.indexOf("from('cos_university_learning_assurance_events')")
  assert.ok(registryFilter > 0 && evidenceRead > registryFilter,
    'the registry filter must run before the evidence read')
  assert.match(registerFn, /\.filter\(\(row: any\) => !already\.has\(/)
})

test('the oldest held artifact is named instead of being silently stepped over', () => {
  // The whole reason this was invisible for days: one collapsed reason with no candidate id.
  assert.match(registerFn, /skipped\.push\(\{ candidateId: artifact\.candidateId, reason: decision\.reason \}\)/)
  assert.match(registerFn, /reason: skipped\[0\]\?\.reason \|\| 'no_mass_artifact_eligible_for_graduation'/)
  assert.match(registerFn, /heldCandidateId: skipped\[0\]\?\.candidateId \|\| null/)
  // Ordering is what makes skipped[0] the oldest, so it must stay ascending.
  assert.match(registerFn, /\.order\('created_at', \{ ascending: true \}\)/)
  // The disabled switch is not an artifact fault and must not be reported ten times.
  assert.match(registerFn, /if \(decision\.reason === 'mass_graduate_registration_disabled'\) break/)
})

test('registration still spends nothing and authorizes no traffic', () => {
  // This lane writes one pending_runtime row. Widening the read must not have widened authority.
  assert.match(registerFn, /eligibleForPromotion: true,\s*\n\s*authorityExpanded: false,/)
  assert.match(registerFn, /productionTrafficAuthorized: false/)
  for (const forbidden of ['ensureMassDistilledEndpoint24Gb', 'activateGraduateRuntime', "status: 'active'"]) {
    assert.ok(!registerFn.includes(forbidden), `registration must not ${forbidden}`)
  }
})

// The route now calls the pure decision with ONE artifact per call. Its gates must reach the same verdicts
// that way, or the fix would have quietly changed who graduates.
const hash = 'd'.repeat(64)
const artifact: MassGraduateArtifact = {
  candidateId: 'mass:aaaa1111', subjectId: 'statistics_data_science', studentModelId: 'Qwen/Qwen3-4B',
  trainedArtifactId: 'cadomos/itmounts-mass-distilled', trainedArtifactHash: hash,
  rollbackArtifactRef: 'hf://models/cadomos/base@abc', status: 'runtime_pending',
  createdAt: '2026-09-24T10:00:00.000Z',
}
const event = (claim: string, verifier: string, extra: Record<string, unknown> = {}): MassGraduateEvent =>
  ({ candidateId: artifact.candidateId, verifier, evidence: { claim, artifactHash: hash, ...extra } })
const fullEvidence = () => [
  event('independent_evaluation', 'independent_scorer', { baselineScore: 0.875, trainedArtifactScore: 0.925 }),
  event('safety_regression_passed', 'independent_scorer'),
  event('unseen_transfer_passed', 'independent_scorer'),
  event('delayed_retention_passed', 'independent_scorer'),
  event('production_canary_healthy', 'host_production_verifier', { exactArtifact: true, productionTrafficAuthorized: false }),
]

test('a single-artifact decision registers on complete evidence and names the exact gap otherwise', () => {
  const ok = decideMassGraduateRegistration({ enabled: true, artifacts: [artifact], events: fullEvidence() })
  assert.equal(ok.register, true)
  assert.equal((ok as any).artifact.candidateId, artifact.candidateId)

  // Each gap must be reported as itself, since that string is now the answer to "why is this one held?".
  const cases: Array<[MassGraduateEvent[], string]> = [
    [fullEvidence().filter(e => e.evidence?.claim !== 'independent_evaluation'), 'independent_verdict_missing'],
    [fullEvidence().filter(e => e.evidence?.claim !== 'delayed_retention_passed'), 'assurance_claims_incomplete'],
    [fullEvidence().filter(e => e.evidence?.claim !== 'production_canary_healthy'), 'exact_artifact_canary_missing'],
  ]
  for (const [events, expected] of cases) {
    const decision = decideMassGraduateRegistration({ enabled: true, artifacts: [artifact], events })
    assert.equal(decision.register, false)
    assert.equal((decision as any).reason, expected)
  }

  // A tie is not an improvement, and an empty evidence set is the starved case itself.
  const tie = decideMassGraduateRegistration({
    enabled: true,
    artifacts: [artifact],
    events: fullEvidence().map(e => e.evidence?.claim === 'independent_evaluation'
      ? event('independent_evaluation', 'independent_scorer', { baselineScore: 0.9, trainedArtifactScore: 0.9 })
      : e),
  })
  assert.equal((tie as any).reason, 'holdout_not_improved')
  const starved = decideMassGraduateRegistration({ enabled: true, artifacts: [artifact], events: [] })
  assert.equal((starved as any).reason, 'independent_verdict_missing')
})
// end of saas/tests/massGraduateRegistrationStarvation.node.test.ts (if this line is missing, the paste was cut short)