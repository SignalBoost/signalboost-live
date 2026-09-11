import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  REPOSITORY_PATROL_EVENT_SCHEMA,
  SECURITY_ENGAGEMENT_SCHEMA,
  ingestDurableRepositoryPatrolEvent,
  serializeSecurityEngagementManifest,
  type DurableRepositoryPatrolStore,
  type SecurityEngagementManifest,
  type SecurityEvidenceChainEntry,
} from '../security-host/index.ts'

const keys = generateKeyPairSync('ed25519')
const manifest: SecurityEngagementManifest = {
  schema: SECURITY_ENGAGEMENT_SCHEMA,
  engagementId: 'durable-patrol',
  approvedBy: 'owner',
  issuedAt: '2026-09-11T00:00:00.000Z',
  notBefore: '2026-09-11T00:00:00.000Z',
  expiresAt: '2026-09-12T00:00:00.000Z',
  role: 'guardian',
  posture: 'guardian-resident',
  targets: [{ kind: 'repository', value: 'SignalBoost/signalboost-live' }],
  allowedActions: ['observe.telemetry', 'evidence.preserve'],
  limits: { maxRequestsPerMinute: 10, maxConcurrentActions: 1, maxDistinctTargets: 1, allowActiveValidation: false },
}
const envelope = {
  manifest,
  signature: {
    algorithm: 'Ed25519' as const,
    keyId: 'test',
    value: sign(null, Buffer.from(serializeSecurityEngagementManifest(manifest)), keys.privateKey).toString('base64'),
  },
}
const trustedKeys = { test: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString() }
const event = {
  schema: REPOSITORY_PATROL_EVENT_SCHEMA,
  eventId: 'github:delivery-1',
  repository: 'SignalBoost/signalboost-live',
  eventType: 'repository.push' as const,
  occurredAt: '2026-09-11T01:00:00.000Z',
  source: 'github-webhook' as const,
  sourceProvenance: { deliveryId: 'delivery-1', eventName: 'push', payloadSha256: 'a'.repeat(64) },
}
const hostState = { now: '2026-09-11T01:00:01.000Z', killSwitchActive: false, requestsInCurrentMinute: 0, concurrentActions: 0, distinctTargetsTouched: 0, targetAlreadyCounted: false }

function memoryStore(outcome: 'inserted' | 'duplicate' | 'conflict' = 'inserted'): DurableRepositoryPatrolStore & { chain: SecurityEvidenceChainEntry[] } {
  const chain: SecurityEvidenceChainEntry[] = []
  return {
    chain,
    async loadEvidenceChain() { return chain },
    async appendEvidence(params) {
      if (outcome === 'inserted') chain.push(params.entry)
      return outcome
    },
  }
}

test('authorized repository telemetry is durably appended with its authenticated delivery identity', async () => {
  const store = memoryStore()
  const result = await ingestDurableRepositoryPatrolEvent({ envelope, trustedKeys, hostState, event, store })
  assert.equal(result.accepted, true)
  assert.equal(result.persisted, true)
  assert.equal(result.duplicate, false)
  assert.equal(store.chain[0].event.eventId, 'github:delivery-1')
  assert.equal(store.chain[0].event.attributionHypotheses.length, 0)
})

test('duplicate delivery is idempotent and a concurrent chain conflict fails closed', async () => {
  const duplicate = await ingestDurableRepositoryPatrolEvent({ envelope, trustedKeys, hostState, event, store: memoryStore('duplicate') })
  assert.deepEqual({ accepted: duplicate.accepted, persisted: duplicate.persisted, duplicate: duplicate.duplicate }, { accepted: true, persisted: true, duplicate: true })

  const conflict = await ingestDurableRepositoryPatrolEvent({ envelope, trustedKeys, hostState, event, store: memoryStore('conflict') })
  assert.equal(conflict.accepted, false)
  assert.equal(conflict.reason, 'evidence_chain_conflict')
})

test('expired scope, kill switch and unavailable durable storage never accept telemetry', async () => {
  const expired = await ingestDurableRepositoryPatrolEvent({ envelope, trustedKeys, hostState: { ...hostState, now: '2026-09-13T00:00:00.000Z' }, event, store: memoryStore() })
  assert.equal(expired.reason, 'engagement_expired')

  const killed = await ingestDurableRepositoryPatrolEvent({ envelope, trustedKeys, hostState: { ...hostState, killSwitchActive: true }, event, store: memoryStore() })
  assert.equal(killed.reason, 'kill_switch_active')

  const unavailable: DurableRepositoryPatrolStore = { async loadEvidenceChain() { throw new Error('down') }, async appendEvidence() { return 'inserted' } }
  const failed = await ingestDurableRepositoryPatrolEvent({ envelope, trustedKeys, hostState, event, store: unavailable })
  assert.equal(failed.reason, 'evidence_store_unavailable')
})

test('GitHub route and migration wire authenticated, serialized, service-role-only persistence', () => {
  const route = readFileSync(new URL('../app/api/webhook/github/route.ts', import.meta.url), 'utf8')
  const store = readFileSync(new URL('../lib/security/repository-patrol-store.ts', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../supabase/migrations/20260911004000_security_repository_patrol_evidence.sql', import.meta.url), 'utf8')
  const productionDelta = readFileSync(new URL('../supabase/migrations/20260911012500_security_repository_patrol_rpc_only_delta.sql', import.meta.url), 'utf8')
  assert.match(route, /verifyGitHubWebhookDelivery/)
  assert.match(route, /deliveryVerification\.valid === false/)
  assert.match(route, /ingestDurableRepositoryPatrolEvent/)
  assert.match(route, /SECURITY_PATROL_KILL_SWITCH/)
  assert.match(route, /security_patrol_configuration_invalid/)
  assert.match(route, /killSwitch !== undefined && killSwitch !== 'true' && killSwitch !== 'false'/)
  assert.match(store, /MAX_EVIDENCE_CHAIN_ENTRIES \+ 1/)
  assert.match(store, /security_evidence_chain_limit_reached/)
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /set search_path = ''/)
  assert.match(migration, /before update or delete/)
  assert.match(migration, /security_repository_patrol_evidence_is_append_only/)
  assert.match(migration, /revoke all on table[\s\S]*from public, anon, authenticated/)
  assert.doesNotMatch(migration, /grant select, insert|grant usage, select on sequence/)
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/)
  assert.match(productionDelta, /revoke insert on table[\s\S]*from service_role/)
  assert.match(productionDelta, /revoke all on sequence[\s\S]*from service_role/)
  assert.match(productionDelta, /security definer/)
  assert.match(productionDelta, /set search_path = ''/)
  assert.match(productionDelta, /before update or delete/)
})
