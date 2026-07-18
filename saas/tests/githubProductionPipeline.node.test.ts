import test from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryCoordinationStore } from '../lib/supervisor/coordination/index.ts'
import {
  GitHubReadOnlyAdapter,
  SupabaseGitHubAuditSink,
  SupabaseGitHubEvidenceSink,
  enqueueGitHubObservation,
  loadActiveGitHubConnections,
  resolveGitHubCredential,
  runAcceptedGitHubObservation,
  type ActiveGitHubConnection,
} from '../lib/provider-framework/index.ts'

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'x-ratelimit-limit':'5000','x-ratelimit-remaining':'4999','x-ratelimit-reset':'1893456000' } })
}

function recordingDb() {
  const writes: Array<{ table: string; operation: string; value: unknown }> = []
  const db = {
    from(table: string) {
      return {
        upsert: async (value: unknown) => { writes.push({ table, operation: 'upsert', value }); return { error: null } },
        insert: async (value: unknown) => { writes.push({ table, operation: 'insert', value }); return { error: null } },
      }
    },
  }
  return { db, writes }
}

const connection: ActiveGitHubConnection = {
  organizationId: 'org_1', providerId: 'github',
  credential: { kind: 'secret_ref', ref: 'env://GITHUB_PROVIDER_TOKEN' },
  status: 'valid', configurationVersion: 1, disabled: false, revoked: false,
  scopes: ['metadata:read'], owner: 'SignalBoost', repository: 'signalboost-live',
}

test('loads an environment-backed GitHub connection without exposing the token', async () => {
  const previous = { org: process.env.GITHUB_PROVIDER_ORGANIZATION_ID, repo: process.env.GITHUB_PROVIDER_REPOSITORY, ref: process.env.GITHUB_PROVIDER_CREDENTIAL_REF }
  process.env.GITHUB_PROVIDER_ORGANIZATION_ID = 'org_env'
  process.env.GITHUB_PROVIDER_REPOSITORY = 'SignalBoost/signalboost-live'
  process.env.GITHUB_PROVIDER_CREDENTIAL_REF = 'env://GITHUB_PROVIDER_TOKEN'
  try {
    const rows = await loadActiveGitHubConnections({}, 1)
    assert.equal(rows[0].owner, 'SignalBoost')
    assert.equal(rows[0].repository, 'signalboost-live')
    assert.equal(rows[0].credential.ref, 'env://GITHUB_PROVIDER_TOKEN')
    assert.doesNotMatch(JSON.stringify(rows), /ghp_|bearer/i)
  } finally {
    process.env.GITHUB_PROVIDER_ORGANIZATION_ID = previous.org
    process.env.GITHUB_PROVIDER_REPOSITORY = previous.repo
    process.env.GITHUB_PROVIDER_CREDENTIAL_REF = previous.ref
  }
})

test('resolves only explicit environment credential references', () => {
  const previous = process.env.GITHUB_PROVIDER_TOKEN
  process.env.GITHUB_PROVIDER_TOKEN = 'test-token-value'
  try {
    assert.equal(resolveGitHubCredential('env://GITHUB_PROVIDER_TOKEN'), 'test-token-value')
    assert.throws(() => resolveGitHubCredential('vault://org/github'), /not_supported/)
  } finally { process.env.GITHUB_PROVIDER_TOKEN = previous }
})

test('deduplicates scheduled GitHub work through the durable coordination identity', async () => {
  const store = new InMemoryCoordinationStore()
  const input = { coordinationStore: store, connection, capability: 'github.repository.read' as const, windowStart: '2026-07-18T18:00:00.000Z' }
  const first = await enqueueGitHubObservation(input)
  const second = await enqueueGitHubObservation(input)
  assert.equal(first.outcome, 'created')
  assert.equal(second.outcome, 'reused')
  assert.equal(first.workItem?.workItemId, second.workItem?.workItemId)
})

test('persists only normalized GitHub evidence and audit rows', async () => {
  const { db, writes } = recordingDb()
  const evidence = new SupabaseGitHubEvidenceSink(db, 'work_1')
  const ids = await evidence.persist({
    providerId: 'github', organizationId: 'org_1', resourceType: 'repository', resourceId: 'SignalBoost/signalboost-live',
    observationType: 'repository_health', severity: 'info', observedState: 'available', expectedState: 'available',
    timestamp: '2026-07-18T18:00:00.000Z', correlationId: 'corr_1', triggerSource: 'scheduler', verificationStatus: 'verified',
    metadata: { private: true }, evidenceReferences: [{ evidenceId: 'ev_1', summary: 'GitHub API read completed', metadata: { path: '/repos/SignalBoost/signalboost-live' } }],
  })
  await new SupabaseGitHubAuditSink(db).persist({ eventType: 'github_observation_completed', workItemId: 'work_1', metadata: { count: 1 } })
  assert.deepEqual(ids, ['ev_1'])
  assert.equal(writes[0].table, 'github_provider_evidence')
  assert.equal(writes[1].table, 'github_provider_audit_events')
  assert.doesNotMatch(JSON.stringify(writes), /authorization|cookie|test-token-value/i)
})

test('runs the bootstrapped read-only GitHub workflow end to end', async () => {
  const previous = process.env.GITHUB_PROVIDER_TOKEN
  process.env.GITHUB_PROVIDER_TOKEN = 'test-token-value'
  const store = new InMemoryCoordinationStore()
  const accepted = await enqueueGitHubObservation({ coordinationStore: store, connection, capability: 'github.repository.read', windowStart: '2026-07-18T18:05:00.000Z' })
  const { db, writes } = recordingDb()
  const adapter = new GitHubReadOnlyAdapter(async () => response({ full_name: 'SignalBoost/signalboost-live', private: true, default_branch: 'main', archived: false, disabled: false }))
  try {
    const observations = await runAcceptedGitHubObservation({ db, coordinationStore: store, connection, workItem: accepted.workItem!, capability: 'github.repository.read', ownerInstanceId: 'github-worker-1', ownerRuntimeId: 'runtime-1', leaseMs: 60000, adapter })
    assert.equal(observations.length, 1)
    assert.equal(observations[0].verificationStatus, 'verified')
    assert.equal((await store.getWorkItem(accepted.workItem!.workItemId))?.state, 'completed')
    assert.ok(writes.some(row => row.table === 'github_provider_evidence'))
    assert.ok(writes.some(row => row.table === 'github_provider_audit_events'))
  } finally { process.env.GITHUB_PROVIDER_TOKEN = previous }
})
