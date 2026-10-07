// saas/tests/cosUniversityCapabilityGainTrace.node.test.ts
//
// Capability-gain trace (owner 2026-10-06): holdout gain grouped by what produced the artifact, with a sign test so a
// regression is only claimed when it is distinguishable from chance. Read only, counts and scores only.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  CAPABILITY_GAIN_TRACE_SCHEMA_VERSION,
  composeCapabilityGainTrace,
  describeCapabilityGainTrace,
  itemsBucket,
  realShareBucket,
} from '../lib/ai/cos/cosUniversityCapabilityGainTrace.ts'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')
const NOW = new Date('2026-10-06T12:00:00Z')
const H = (c: string) => c.repeat(64)
const evalRow = (id: string, hash: string, baseline: number, trained: number, at = '2026-10-05T10:00:00Z', extra: Record<string, unknown> = {}) => ({
  candidate_id: id, trained_artifact_hash: hash, created_at: at, baseline_score: baseline, trained_artifact_score: trained,
  holdout_improved: trained > baseline, safety_passed: true, unseen_transfer_passed: true, delayed_retention_passed: true,
  evaluator_version: 'v4', holdout_case_count: 4, ...extra,
})

test('gain is grouped by recipe and source mix, using only the latest exam per exact artifact', () => {
  const trace = composeCapabilityGainTrace({
    now: NOW,
    since: '2026-09-29T12:00:00Z',
    evaluations: [
      evalRow('mass:a', H('a'), 0.5, 0.25, '2026-10-04T10:00:00Z'),
      evalRow('mass:a', H('a'), 0.5, 0.75, '2026-10-05T10:00:00Z'),
      evalRow('mass:b', H('b'), 0.5, 0.25),
      evalRow('mass:c', H('c'), 0.5, 0.5),
      evalRow('mass:d', H('d'), 0.5, 0.75),
    ],
    artifacts: [
      { candidate_id: 'mass:a', trained_artifact_hash: H('a'), subject_id: 'law', teacher: 'teacher-x', base: 'qwen', profile: 'p1', optimizer: 'adamw', items: '120', replay: 'true', anchor: 'false', ballast: '0' },
      { candidate_id: 'mass:b', trained_artifact_hash: H('b'), subject_id: 'law', teacher: 'teacher-y', base: 'qwen', profile: 'p1', optimizer: 'adamw', items: '30', replay: 'false', anchor: 'false', ballast: '20' },
      { candidate_id: 'mass:c', trained_artifact_hash: H('c'), subject_id: 'cs', teacher: 'teacher-x', base: 'qwen', profile: 'p2', optimizer: 'adamw', items: '120' },
    ],
    attributions: [{ artifact_hash: H('a'), real: '100' }, { artifact_hash: H('b'), real: '0' }],
  })
  assert.equal(trace.schemaVersion, CAPABILITY_GAIN_TRACE_SCHEMA_VERSION)
  assert.equal(trace.overall.n, 4, 'one exam per exact artifact (the latest)')
  assert.equal(trace.overall.improved, 2)
  assert.equal(trace.overall.regressed, 1)
  assert.equal(trace.overall.unchanged, 1)
  assert.equal(trace.unmatchedArtifacts, 1)
  const law = trace.dimensions.subject.find(g => g.key === 'law')!
  assert.equal(law.n, 2)
  assert.equal(law.meanGain, 0)
  const real = Object.fromEntries(trace.dimensions.realSourceShare.map(g => [g.key, g.meanGain]))
  assert.deepEqual(real, { '100%': 0.25, '0%': -0.25, unknown: 0.125 })
  assert.deepEqual(trace.dimensions.reasoningBallast.map(g => g.key).sort(), ['no', 'unknown', 'yes'])
  assert.equal(trace.holdoutCases['4'], 4)
  const cross = Object.fromEntries(trace.dimensions.subjectXfailureReplay.map(g => [g.key, g.n]))
  assert.deepEqual(cross, { 'law | replay=yes': 1, 'law | replay=no': 1, 'cs | replay=unknown': 1, 'unknown | replay=unknown': 1 })
  assert.match(describeCapabilityGainTrace(trace), /by subjectXfailureReplay:\n    cs \| replay=unknown/)
  // Real-source share WITHIN each subject (2026-10-07), so the 50% floor decision is not read off a subject-mix effect.
  const realCross = Object.fromEntries(trace.dimensions.subjectXrealSourceShare.map(g => [g.key, g.meanGain]))
  console.log('[subjectXrealSourceShare]', JSON.stringify(realCross))
  assert.ok(Object.keys(realCross).every(key => / \| real=(0%|1-49%|50-99%|100%|unknown)$/.test(key)))
  assert.equal(trace.dimensions.subjectXrealSourceShare.reduce((sum, g) => sum + g.n, 0), trace.overall.n)
  assert.match(describeCapabilityGainTrace(trace), /by subjectXrealSourceShare:\n/)
})

test('the replay A/B compares the randomized replay arm against its control, not against non-remediation runs', () => {
  const trace = composeCapabilityGainTrace({
    now: NOW,
    since: '2026-09-29T12:00:00Z',
    evaluations: [
      evalRow('mass:r', H('r'), 0.5, 0.25),
      evalRow('mass:c', H('c'), 0.5, 0.75),
      evalRow('mass:n', H('n'), 0.5, 0.5),
      evalRow('mass:o', H('o'), 0.5, 0.5),
      evalRow('mass:m', H('m'), 0.5, 0.5),
    ],
    artifacts: [
      { candidate_id: 'mass:r', trained_artifact_hash: H('r'), replay: 'true', replayEligible: '20', replayArm: 'true' },
      // Control: eligible, not selected, so no replay pass ran (failureDerivedReplayRequired false).
      { candidate_id: 'mass:c', trained_artifact_hash: H('c'), replay: 'false', replayEligible: '20', replayArm: 'false' },
      { candidate_id: 'mass:n', trained_artifact_hash: H('n'), replay: 'false', replayEligible: '0', replayArm: 'false' },
      // Trained before the A/B: no eligibility receipt.
      { candidate_id: 'mass:o', trained_artifact_hash: H('o'), replay: 'true' },
      { candidate_id: 'mass:m', trained_artifact_hash: H('m'), replay: 'false', replayEligible: '5' },
    ],
    attributions: [],
  })
  const arms = Object.fromEntries(trace.dimensions.failureReplayArm.map(g => [g.key, g.meanGain]))
  assert.deepEqual(arms, { replay: -0.25, control: 0.25, not_eligible: 0, unrecorded: 0 })
  assert.equal(trace.dimensions.failureReplayArm.find(g => g.key === 'unrecorded')!.n, 2, 'pre-A/B and arm-less receipts never count as an arm')
  assert.match(describeCapabilityGainTrace(trace), /by failureReplayArm:/)
})

test('the sign test only calls a regression when it is distinguishable from chance', () => {
  // 166 improved vs 179 regressed (the 2026-10-06 7-day cohort): z ~ -0.7, which is chance.
  const evaluations = [
    ...Array.from({ length: 166 }, (_, i) => evalRow(`mass:i${i}`, H('a'), 0.5, 0.75)),
    ...Array.from({ length: 179 }, (_, i) => evalRow(`mass:r${i}`, H('b'), 0.5, 0.25)),
  ]
  const trace = composeCapabilityGainTrace({ now: NOW, since: 'x', evaluations, artifacts: [], attributions: [] })
  assert.equal(trace.signTestZ, -0.7)
  assert.match(describeCapabilityGainTrace(trace), /indistinguishable from chance/)
  const lopsided = composeCapabilityGainTrace({
    now: NOW, since: 'x', artifacts: [], attributions: [],
    evaluations: Array.from({ length: 30 }, (_, i) => evalRow(`mass:x${i}`, H('c'), 0.5, i < 5 ? 0.75 : 0.25)),
  })
  assert.match(describeCapabilityGainTrace(lopsided), /more regress than improve beyond chance/)
})

test('buckets and missing values', () => {
  assert.equal(itemsBucket('120'), '100-199')
  assert.equal(itemsBucket(null), 'unknown')
  assert.equal(realShareBucket('0'), '0%')
  assert.equal(realShareBucket('62.5'), '50-99%')
  assert.equal(realShareBucket(''), 'unknown')
  const trace = composeCapabilityGainTrace({
    now: NOW, since: 'x', artifacts: [], attributions: [],
    evaluations: [evalRow('mass:z', H('z'), null as unknown as number, 0.5)],
  })
  assert.equal(trace.overall.n, 0, 'an exam without a baseline score is not a gain of anything')
})

test('the route is read only by construction and cron-authorized, and the watchdog publishes it', () => {
  const route = read('../app/api/cron/cos-university-capability-gain-trace/route.ts')
  assert.match(route, /db: readOnlyDb\(service\)/)
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/)
  assert.match(route, /process\.env\.CRON_SECRET/)
  const lib = read('../lib/ai/cos/cosUniversityCapabilityGainTrace.ts')
  assert.doesNotMatch(lib, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/)
  const workflow = read('../../.github/workflows/assembly-line-live-proof.yml')
  assert.match(workflow, /cos-university-capability-gain-trace/)
  assert.match(workflow, /## Capability gain trace/)
})
// end of saas/tests/cosUniversityCapabilityGainTrace.node.test.ts (if this line is missing, the paste was cut short)
