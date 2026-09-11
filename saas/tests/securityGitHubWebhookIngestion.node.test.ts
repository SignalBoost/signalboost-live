import assert from 'node:assert/strict'
import { createHmac, generateKeyPairSync, sign as signEd25519 } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  SECURITY_ENGAGEMENT_SCHEMA,
  ingestAuthenticatedGitHubRepositoryWebhook,
  serializeSecurityEngagementManifest,
  type GitHubWebhookDeliveryHeaders,
  type RepositoryWebhookAppendResult,
  type RepositoryWebhookEvidenceStore,
  type SecurityEngagementManifest,
  type SecurityEvidenceChainEntry,
  type SignedSecurityEngagement,
} from '../security-host/index.ts'

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString()
const SECRET = 'production-webhook-secret-for-tests'

function engagement(repository = 'SignalBoost/signalboost-live'): SignedSecurityEngagement {
  const manifest: SecurityEngagementManifest = {
    schema: SECURITY_ENGAGEMENT_SCHEMA,
    engagementId: 'guardian-repository-patrol-1',
    approvedBy: 'security-owner',
    issuedAt: '2026-09-11T00:00:00.000Z',
    notBefore: '2026-09-11T00:00:00.000Z',
    expiresAt: '2026-09-12T00:00:00.000Z',
    role: 'guardian',
    posture: 'guardian-resident',
    targets: [{ kind: 'repository', value: repository }],
    allowedActions: ['observe.telemetry', 'evidence.preserve'],
    limits: { maxRequestsPerMinute: 10, maxConcurrentActions: 1, maxDistinctTargets: 1, allowActiveValidation: false },
  }
  return {
    manifest,
    signature: {
      algorithm: 'Ed25519',
      keyId: 'owner-key-1',
      value: signEd25519(null, Buffer.from(serializeSecurityEngagementManifest(manifest)), privateKey).toString('base64'),
    },
  }
}

function body(repository = 'SignalBoost/signalboost-live'): string {
  return JSON.stringify({
    ref: 'refs/heads/main',
    after: 'abcdef1234567890abcdef1234567890abcdef12',
    repository: { full_name: repository },
    sender: { login: 'provider-reported-user' },
    commits: [{ modified: ['.github/workflows/pipeline.yml'], added: [], removed: [] }],
  })
}

function headers(rawBody: string, deliveryId = 'delivery-1'): GitHubWebhookDeliveryHeaders {
  return {
    signature256: `sha256=${createHmac('sha256', SECRET).update(Buffer.from(rawBody)).digest('hex')}`,
    deliveryId,
    eventName: 'push',
    userAgent: 'GitHub-Hookshot/test',
  }
}

class MemoryStore implements RepositoryWebhookEvidenceStore {
  chain: SecurityEvidenceChainEntry[] = []
  deliveries = new Set<string>()

  async loadState(params: { engagementId: string; repository: string }) {
    return {
      evidenceChain: this.chain,
      requestsInCurrentMinute: this.deliveries.size,
      distinctTargetsTouched: this.chain.length ? 1 : 0,
      targetAlreadyCounted: this.chain.some(entry => entry.event.target?.value.toLowerCase() === params.repository.toLowerCase()),
    }
  }

  async append(params: Parameters<RepositoryWebhookEvidenceStore['append']>[0]): Promise<RepositoryWebhookAppendResult> {
    if (this.deliveries.has(params.deliveryId)) return 'duplicate'
    const latest = this.chain[this.chain.length - 1]
    if (params.entry.index !== this.chain.length || params.entry.previousHash !== (latest?.hash || '0'.repeat(64))) return 'chain_conflict'
    this.deliveries.add(params.deliveryId)
    this.chain.push(params.entry)
    return 'appended'
  }
}

function run(store: RepositoryWebhookEvidenceStore, rawBody = body(), config: { engagement?: unknown; killSwitchActive?: boolean } = {}) {
  return ingestAuthenticatedGitHubRepositoryWebhook({
    rawBody,
    headers: headers(rawBody),
    receivedAt: '2026-09-11T01:00:00.000Z',
    config: {
      secret: SECRET,
      engagement: config.engagement ?? engagement(),
      trustedKeys: { 'owner-key-1': PUBLIC_KEY },
      killSwitchActive: config.killSwitchActive ?? false,
    },
    store,
  })
}

test('authenticated exact-scope GitHub delivery appends durable Guardian evidence', async () => {
  const store = new MemoryStore()
  const result = await run(store)
  assert.equal(result.status, 202)
  assert.equal(result.outcome, 'evidence_appended')
  assert.equal(result.repository, 'signalboost/signalboost-live')
  assert.equal(store.chain.length, 1)
  assert.equal(store.chain[0].event.attributionHypotheses.length, 0)
  assert.ok(result.indicators?.includes('workflow_path_changed'))
})

test('duplicate GitHub delivery is idempotent and does not append evidence twice', async () => {
  const store = new MemoryStore()
  assert.equal((await run(store)).status, 202)
  const duplicate = await run(store)
  assert.equal(duplicate.status, 200)
  assert.equal(duplicate.outcome, 'repository_event_replayed')
  assert.equal(store.chain.length, 1)
})

test('tampered body, out-of-scope repository, kill switch, and corrupted chain fail closed', async () => {
  const signedBody = body()
  const tampered = await ingestAuthenticatedGitHubRepositoryWebhook({
    rawBody: `${signedBody} `,
    headers: headers(signedBody),
    receivedAt: '2026-09-11T01:00:00.000Z',
    config: { secret: SECRET, engagement: engagement(), trustedKeys: { 'owner-key-1': PUBLIC_KEY }, killSwitchActive: false },
    store: new MemoryStore(),
  })
  assert.equal(tampered.status, 401)

  const outside = body('SignalBoost/sibling-repository')
  const outOfScope = await ingestAuthenticatedGitHubRepositoryWebhook({
    rawBody: outside, headers: headers(outside), receivedAt: '2026-09-11T01:00:00.000Z',
    config: { secret: SECRET, engagement: engagement(), trustedKeys: { 'owner-key-1': PUBLIC_KEY }, killSwitchActive: false },
    store: new MemoryStore(),
  })
  assert.equal(outOfScope.outcome, 'target_out_of_scope')
  assert.equal((await run(new MemoryStore(), body(), { killSwitchActive: true })).outcome, 'kill_switch_active')

  const corrupted = new MemoryStore()
  await run(corrupted)
  corrupted.chain[0] = { ...corrupted.chain[0], hash: 'f'.repeat(64) }
  const secondBody = body()
  const corruptedResult = await ingestAuthenticatedGitHubRepositoryWebhook({
    rawBody: secondBody, headers: headers(secondBody, 'delivery-2'), receivedAt: '2026-09-11T01:01:00.000Z',
    config: { secret: SECRET, engagement: engagement(), trustedKeys: { 'owner-key-1': PUBLIC_KEY }, killSwitchActive: false },
    store: corrupted,
  })
  assert.equal(corruptedResult.outcome, 'evidence_chain_invalid')
})

test('live route keeps raw-body verification before JSON handling and exposes no mutation path', () => {
  const route = readFileSync(new URL('../app/api/security/github/repository-webhook/route.ts', import.meta.url), 'utf8')
  assert.ok(route.indexOf('request.text()') < route.indexOf('await ingestAuthenticatedGitHubRepositoryWebhook'))
  assert.match(route, /SECURITY_GITHUB_WEBHOOK_SECRET/)
  assert.match(route, /SECURITY_GUARDIAN_ENGAGEMENT_JSON/)
  assert.match(route, /SECURITY_TRUSTED_ENGAGEMENT_KEYS_JSON/)
  assert.match(route, /providerMutation: false/)
  assert.doesNotMatch(route, /createWebhook|updateWebhook|deleteWebhook|octokit/i)
})

test('durable evidence migration is append-only, service-only, and serializes chain writes', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20260911004500_security_repository_webhook_ingestion.sql', import.meta.url), 'utf8')
  assert.match(migration, /enable row level security/i)
  assert.match(migration, /revoke all on public\.security_repository_evidence_chain from anon, authenticated/i)
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i)
  assert.match(migration, /revoke all on function public\.append_security_repository_evidence[\s\S]*from public, anon, authenticated/i)
  assert.match(migration, /before update or delete/i)
})
