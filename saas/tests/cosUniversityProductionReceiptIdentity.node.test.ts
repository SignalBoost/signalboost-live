import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import {
  COS_UNIVERSITY_ASSURANCE_PROFILE,
  COS_UNIVERSITY_FEATURE_GATED_PATHS,
} from '../lib/ai/cos/cosUniversityLearningAssurance.ts'
import {
  evaluateCosUniversityProductionVerification,
  type ProductionPathEventRow,
} from '../lib/ai/cos/cosUniversityProductionVerificationCore.ts'

type RecordPath = typeof import('../lib/ai/cos/cosUniversityProductionAssurance.ts').recordCosUniversityProductionPath
type StoredRow = ProductionPathEventRow & { event_type: string; evidence_hash: string }
const DEPLOYMENT = 'dpl_isolated_receipt_test'
const COMMIT = 'a'.repeat(40)
const at = (minute: number) => new Date(`2026-09-11T21:${String(minute).padStart(2, '0')}:00.000Z`)
const success = { runnerInvoked: true, status: 'completed', errors: [] }
const failure = { error: 'registry_unavailable', failurePhase: 'registry', runnerInvoked: false }

/** Execute the checked-in writer; only its database/environment ports are isolated. */
function harness(options: {
  env?: Record<string, string | undefined>; databaseAvailable?: boolean; writeError?: Error
} = {}) {
  const rows: StoredRow[] = []
  let writes = 0
  const db = {
    from(table: string) {
      assert.equal(table, 'cos_university_learning_assurance_events')
      return {
        async upsert(row: StoredRow, policy: { onConflict: string; ignoreDuplicates: boolean }) {
          writes++
          assert.deepEqual(policy, { onConflict: 'event_key', ignoreDuplicates: true })
          if (options.writeError) return { error: options.writeError }
          // Faithfully model ON CONFLICT DO NOTHING, including the unchanged original timestamp.
          if (!rows.some(existing => existing.event_key === row.event_key)) rows.push(structuredClone(row))
          return { error: null }
        },
      }
    },
  }
  const source = readFileSync(new URL('../lib/ai/cos/cosUniversityProductionAssurance.ts', import.meta.url), 'utf8')
  const js = stripTypeScriptTypes(source, { mode: 'strip' })
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*$/gm, '')
    .replace(/^export\s+/gm, '')
  const env = {
    VERCEL_ENV: 'production', VERCEL_DEPLOYMENT_ID: DEPLOYMENT, VERCEL_GIT_COMMIT_SHA: COMMIT,
    COS_UNIVERSITY_MASTERS_LEARNING_ENABLED: 'true', ...options.env,
  }
  const record = new Function('createHash', 'randomUUID', 'cosServiceDb',
    'COS_UNIVERSITY_ASSURANCE_PROFILE', 'COS_UNIVERSITY_FEATURE_GATED_PATHS', 'process',
    `${js}\nreturn recordCosUniversityProductionPath;`)(
    createHash, randomUUID, () => options.databaseAvailable === false ? null : db,
    COS_UNIVERSITY_ASSURANCE_PROFILE, COS_UNIVERSITY_FEATURE_GATED_PATHS, { env },
  ) as RecordPath
  return { record, rows, writes: () => writes }
}

function verify(rows: StoredRow[], now = at(50)) {
  const result = evaluateCosUniversityProductionVerification({
    deploymentId: DEPLOYMENT, commitSha: COMMIT, now, rows,
  }).paths.find(path => path.path === 'masters_learning')
  assert.ok(result)
  return result
}

for (const [label, failedEvidence] of [
  ['thrown registry failure', failure],
  ['returned worker failure', { runnerInvoked: true, status: 'error', errors: ['worker_unavailable'] }],
] as const) {
  test(`a repeated ${label} supersedes an intervening success in the same hour`, async () => {
    const h = harness()
    const first = await h.record({ path: 'masters_learning', invocationSucceeded: false, evidence: failedEvidence, now: at(10) })
    const original = structuredClone(h.rows[0])
    await h.record({ path: 'masters_learning', invocationSucceeded: true, evidence: success, now: at(20) })
    assert.equal(verify(h.rows).verified, true)
    const last = await h.record({ path: 'masters_learning', invocationSucceeded: false, evidence: failedEvidence, now: at(30) })
    assert.equal(verify(h.rows).invocationSucceeded, false, 'latest failure must not disappear behind an old success')
    assert.equal(verify(h.rows).verified, false)
    assert.equal(h.rows.length, 3)
    assert.notEqual(last, first)
    assert.equal(verify(h.rows).evidenceRef, last)
    assert.deepEqual(h.rows[0], original, 'append-only history must not be rewritten')
    assert.equal(h.rows[0].evidence_hash, h.rows[2].evidence_hash, 'same evidence retains its content hash')
  })
}

test('a repeated success after an intervening failure records genuine recovery', async () => {
  const h = harness()
  await h.record({ path: 'masters_learning', invocationSucceeded: true, evidence: success, now: at(10) })
  await h.record({ path: 'masters_learning', invocationSucceeded: false, evidence: failure, now: at(20) })
  assert.equal(verify(h.rows).verified, false)
  const last = await h.record({ path: 'masters_learning', invocationSucceeded: true, evidence: success, now: at(30) })
  assert.equal(verify(h.rows).verified, true)
  assert.equal(verify(h.rows).evidenceRef, last)
  assert.equal(h.rows.length, 3)
})

for (const passed of [false, true]) {
  test(`distinct ${passed ? 'successful' : 'failed'} recordings survive an identical millisecond clock`, async () => {
    const h = harness()
    const input = { path: 'masters_learning' as const, invocationSucceeded: passed,
      evidence: passed ? success : failure, now: at(10) }
    const refs = await Promise.all(Array.from({ length: 8 }, () => h.record(input)))
    assert.equal(new Set(refs).size, 8, 'timestamp precision alone must not define identity')
    assert.equal(h.rows.length, 8)
    assert.equal(new Set(h.rows.map(row => row.evidence_hash)).size, 1)
  })
}

test('receipt uniqueness adds no runner evidence and cannot turn metadata into execution proof', async () => {
  const h = harness()
  await h.record({ path: 'masters_learning', invocationSucceeded: true, evidence: { enabled: true }, now: at(10) })
  assert.deepEqual(Object.keys(h.rows[0].evidence!).sort(),
    ['claim', 'enabled', 'featureEnabled', 'featureFlag', 'invocationSucceeded'])
  assert.equal(verify(h.rows).verified, false)
  assert.equal(verify(h.rows).executionBlocker, 'execution_evidence_missing')
})

test('write failure propagates once without returning a fabricated durable reference', async () => {
  const error = new Error('isolated_storage_failure')
  const h = harness({ writeError: error })
  await assert.rejects(h.record({ path: 'masters_learning', invocationSucceeded: false, evidence: failure, now: at(10) }),
    (actual: unknown) => actual === error)
  assert.equal(h.writes(), 1)
  assert.equal(h.rows.length, 0)
})

test('missing database or Production identity still prevents receipt writes', async () => {
  for (const options of [
    { databaseAvailable: false },
    { env: { VERCEL_ENV: 'preview' } },
    { env: { VERCEL_GIT_COMMIT_SHA: '' } },
    { env: { VERCEL_DEPLOYMENT_ID: '', VERCEL_URL: '' } },
  ]) {
    const h = harness(options)
    assert.equal(await h.record({ path: 'masters_learning', invocationSucceeded: false, evidence: failure, now: at(10) }), null)
    assert.equal(h.writes(), 0)
  }
})

test('recording preserves evidence hash, exact deployment, timestamp and 24-hour expiry', async () => {
  const h = harness()
  await h.record({ path: 'masters_learning', invocationSucceeded: true, evidence: success, now: at(10) })
  const row = h.rows[0]
  assert.equal(row.event_type, 'production_path')
  assert.equal(row.deployment_id, DEPLOYMENT)
  assert.equal(row.commit_sha, COMMIT)
  assert.equal(row.verifier, 'host_production_verifier')
  assert.equal(row.observed_at, at(10).toISOString())
  assert.equal(Date.parse(row.expires_at!) - Date.parse(row.observed_at), 86_400_000)
  assert.equal(row.evidence_hash, createHash('sha256').update(JSON.stringify(row.evidence)).digest('hex'))
  assert.equal(row.evidence!.claim, 'path_executed_not_learning_improved')
})

test('a disabled feature remains unverified even with a unique successful receipt', async () => {
  const h = harness({ env: { COS_UNIVERSITY_MASTERS_LEARNING_ENABLED: 'false' } })
  await h.record({ path: 'masters_learning', invocationSucceeded: true, evidence: success, now: at(10) })
  assert.equal(verify(h.rows).featureEnabled, false)
  assert.equal(verify(h.rows).verified, false)
})

test('opposite outcomes at the same clock fail closed regardless of database row order', async () => {
  const h = harness()
  await h.record({ path: 'masters_learning', invocationSucceeded: true, evidence: success, now: at(10) })
  const failed = await h.record({ path: 'masters_learning', invocationSucceeded: false, evidence: failure, now: at(10) })
  for (const rows of [h.rows, [...h.rows].reverse()]) {
    assert.equal(verify(rows).verified, false)
    assert.equal(verify(rows).invocationSucceeded, false)
    assert.equal(verify(rows).evidenceRef, failed)
  }
})

test('a same-clock conflict requires a later successful observation to establish recovery', async () => {
  const h = harness()
  await h.record({ path: 'masters_learning', invocationSucceeded: true, evidence: success, now: at(10) })
  await h.record({ path: 'masters_learning', invocationSucceeded: false, evidence: failure, now: at(10) })
  assert.equal(verify(h.rows).verified, false)
  const recovered = await h.record({ path: 'masters_learning', invocationSucceeded: true, evidence: success, now: at(11) })
  assert.equal(verify(h.rows).verified, true)
  assert.equal(verify(h.rows).evidenceRef, recovered)
})

test('equally valid tied receipts select deterministic evidence without inventing chronology', async () => {
  const h = harness()
  const input = { path: 'masters_learning' as const, invocationSucceeded: true, evidence: success, now: at(10) }
  await h.record(input); await h.record(input)
  assert.equal(verify(h.rows).verified, true)
  assert.deepEqual(verify(h.rows), verify([...h.rows].reverse()))
})

test('a tied metadata-only receipt cannot be hidden by an execution receipt', async () => {
  const h = harness()
  await h.record({ path: 'masters_learning', invocationSucceeded: true, evidence: success, now: at(10) })
  const missing = await h.record({ path: 'masters_learning', invocationSucceeded: true, evidence: { enabled: true }, now: at(10) })
  for (const rows of [h.rows, [...h.rows].reverse()]) {
    assert.equal(verify(rows).verified, false)
    assert.equal(verify(rows).executionBlocker, 'execution_evidence_missing')
    assert.equal(verify(rows).evidenceRef, missing)
  }
})

test('an untrusted verifier at a tied timestamp cannot disappear behind a valid receipt', async () => {
  const h = harness()
  await h.record({ path: 'masters_learning', invocationSucceeded: true, evidence: success, now: at(10) })
  const untrusted: StoredRow = { ...h.rows[0], event_key: 'untrusted-test-receipt', verifier: 'self_report' }
  for (const rows of [[h.rows[0], untrusted], [untrusted, h.rows[0]]]) assert.equal(verify(rows).verified, false)
})

test('older failures do not veto later successful tied observations', async () => {
  const h = harness()
  await h.record({ path: 'masters_learning', invocationSucceeded: false, evidence: failure, now: at(9) })
  await h.record({ path: 'masters_learning', invocationSucceeded: true, evidence: success, now: at(10) })
  await h.record({ path: 'masters_learning', invocationSucceeded: true, evidence: success, now: at(10) })
  assert.equal(verify(h.rows).verified, true)
  assert.deepEqual(verify(h.rows), verify([...h.rows].reverse()))
})
