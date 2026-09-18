// saas/tests/cosLaneStatus.node.test.ts
// Pins the operational lane-status contract: every exit path of the canary lane reports, the write is
// best effort, and nothing about it can reach an academic gate.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  COS_LANE_STATUS_FUNCTION,
  buildCosLaneStatusArgs,
  recordCosLaneStatus,
} from '../lib/ai/cos/cosLaneStatus.ts'

const ROUTE = readFileSync(
  new URL('../app/api/cron/runpod-mass-distilled-local-deploy/route.ts', import.meta.url),
  'utf8',
)

test('args are built with the stored procedure parameter names', () => {
  const args = buildCosLaneStatusArgs({
    lane: 'runpod-mass-distilled-local-deploy',
    outcome: 'skipped',
    reason: 'no_atomically_claimable_mass_distilled_artifact',
    detail: { approvalIssued: false, approvalReason: 'window_exhausted' },
    deploymentId: 'dpl_123',
    commitSha: 'abc123',
  })
  assert.deepEqual(Object.keys(args).sort(), [
    'p_commit_sha', 'p_deployment_id', 'p_detail', 'p_lane', 'p_outcome', 'p_reason',
  ])
  assert.equal(args.p_lane, 'runpod-mass-distilled-local-deploy')
  assert.deepEqual(args.p_detail, { approvalIssued: false, approvalReason: 'window_exhausted' })
})

test('detail drops nullish and non-finite values and stringifies objects', () => {
  const args = buildCosLaneStatusArgs({
    lane: 'l', outcome: 'worked', reason: 'r',
    detail: { a: null, b: undefined, c: Number.NaN, d: Number.POSITIVE_INFINITY, e: 0, f: false, g: { n: 1 } },
  })
  assert.deepEqual(Object.keys(args.p_detail as object).sort(), ['e', 'f', 'g'])
  assert.equal((args.p_detail as any).e, 0)
  assert.equal((args.p_detail as any).f, false)
  assert.equal((args.p_detail as any).g, '{"n":1}')
})

test('empty detail, deployment and commit are accepted', () => {
  const args = buildCosLaneStatusArgs({ lane: 'l', outcome: 'failed', reason: 'boom' })
  assert.deepEqual(args.p_detail, {})
  assert.equal(args.p_deployment_id, null)
  assert.equal(args.p_commit_sha, null)
})

test('missing lane, missing reason and bad outcome fail closed', () => {
  assert.throws(() => buildCosLaneStatusArgs({ lane: '  ', outcome: 'worked', reason: 'r' }),
    /cos_lane_status_lane_missing/)
  assert.throws(() => buildCosLaneStatusArgs({ lane: 'l', outcome: 'worked', reason: '' }),
    /cos_lane_status_reason_missing/)
  assert.throws(() => buildCosLaneStatusArgs({ lane: 'l', outcome: 'done' as never, reason: 'r' }),
    /cos_lane_status_outcome_invalid/)
})

test('calls the stored procedure and reports success', async () => {
  const calls: any[] = []
  const db = { rpc: (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return Promise.resolve({ error: null }) } }
  const ok = await recordCosLaneStatus({ db, lane: 'l', outcome: 'worked', reason: 'canary_passed' })
  assert.equal(ok, true)
  assert.equal(calls[0].fn, COS_LANE_STATUS_FUNCTION)
  assert.equal(calls[0].args.p_reason, 'canary_passed')
})

test('a failed or throwing write never propagates', async () => {
  const errorDb = { rpc: () => Promise.resolve({ error: { message: 'permission denied' } }) }
  assert.equal(await recordCosLaneStatus({ db: errorDb, lane: 'l', outcome: 'skipped', reason: 'r' }), false)

  const throwingDb = { rpc: () => { throw new Error('connection lost') } }
  assert.equal(await recordCosLaneStatus({ db: throwingDb as any, lane: 'l', outcome: 'skipped', reason: 'r' }), false)

  assert.equal(await recordCosLaneStatus({ db: null, lane: 'l', outcome: 'skipped', reason: 'r' }), false)

  // An invalid argument is a programming error, but it still must not take the lane down.
  const okDb = { rpc: () => Promise.resolve({ error: null }) }
  assert.equal(await recordCosLaneStatus({ db: okDb, lane: '', outcome: 'skipped', reason: 'r' }), false)
})

test('the canary lane reports on every exit path', () => {
  assert.match(ROUTE, /import \{ recordCosLaneStatus \}/)
  for (const reason of ['runpod_balance_guard', 'no_atomically_claimable_mass_distilled_artifact', 'canary_failed', 'canary_passed', 'lane_error']) {
    assert.match(ROUTE, new RegExp(`laneStatus\\('(worked|skipped|failed)','${reason}'`), reason)
  }
  // The skip response now carries the rolling-authority reason too, which previously only reached a log line.
  assert.match(ROUTE, /reason:'no_atomically_claimable_mass_distilled_artifact',approval:rolling/)
})

test('lane status is never written to the assurance ledger or read by a gate', () => {
  const module = readFileSync(new URL('../lib/ai/cos/cosLaneStatus.ts', import.meta.url), 'utf8')
  // Assert against code, not the explanatory comments, which name these deliberately.
  const code = module.split('\n').filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*')).join('\n')
  assert.doesNotMatch(code, /cos_university_learning_assurance_events/)
  assert.doesNotMatch(code, /LearningPathId|recordCosUniversityProductionPath/)
  assert.doesNotMatch(module, /^import .*(LearningAssurance|ProductionAssurance)/m)
  // No select path exists: this module writes only.
  assert.doesNotMatch(code, /\.select\(/)
})
