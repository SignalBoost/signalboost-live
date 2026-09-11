import './securityGitHubWebhookIngestion.node.test.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac, generateKeyPairSync, sign as signEd25519 } from 'node:crypto'
import { mkdtemp, writeFile, mkdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createRepositoryManifest } from '../lib/repository-intelligence/index.ts'
import {
  REPOSITORY_PATROL_EVENT_SCHEMA,
  SECURITY_ENGAGEMENT_SCHEMA,
  ingestRepositoryPatrolEvent,
  normalizeAuthenticatedGitHubRepositoryWebhook,
  serializeSecurityEngagementManifest,
  verifyGitHubWebhookDelivery,
  type GitHubWebhookDeliveryHeaders,
  type RepositoryPatrolEvent,
  type SecurityEngagementManifest,
  type SecurityEvidenceChainEntry,
  type SignedSecurityEngagement,
} from '../security-host/index.ts'

test('scanner excludes unsafe paths and never reports absolute paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'repo-security-'))
  try {
    await mkdir(join(root, 'node_modules'), { recursive: true })
    await mkdir(join(root, '.git'), { recursive: true })
    await writeFile(join(root, '.env'), 'SECRET=x')
    await writeFile(join(root, 'id_rsa'), 'private')
    await writeFile(join(root, 'node_modules', 'a.ts'), 'x')
    await writeFile(join(root, 'binary.bin'), Buffer.from([0, 1, 2]))
    await writeFile(join(root, 'large.ts'), 'x'.repeat(32))
    try { await symlink(tmpdir(), join(root, 'escape')) } catch {}
    const before = await (await import('node:fs/promises')).readFile(join(root, '.env'), 'utf8')
    const manifest = await createRepositoryManifest({ repositoryRoot: root, maximumFileSizeBytes: 16, maximumTotalBytes: 16 })
    assert.equal(manifest.files.some(item => item.relativePath.includes('.env') || item.relativePath.includes('id_rsa') || item.relativePath.includes('node_modules') || item.relativePath.includes('.git')), false)
    assert.equal(manifest.files.every(item => !item.relativePath.startsWith('/')), true)
    assert.equal(await (await import('node:fs/promises')).readFile(join(root, '.env'), 'utf8'), before)
    await assert.rejects(createRepositoryManifest({ repositoryRoot: root, repositoryWrites: true }))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

const signingKeys = generateKeyPairSync('ed25519')
const TEST_KEY_ID = 'repo-patrol-test-key'
const trustedKeys = Object.freeze({
  [TEST_KEY_ID]: signingKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
})

function repositoryManifest(repository = 'SignalBoost/signalboost-live'): SecurityEngagementManifest {
  return {
    schema: SECURITY_ENGAGEMENT_SCHEMA,
    engagementId: 'repo-patrol-engagement',
    approvedBy: 'security-owner',
    issuedAt: '2026-09-10T20:00:00.000Z',
    notBefore: '2026-09-10T20:00:00.000Z',
    expiresAt: '2026-09-10T23:00:00.000Z',
    role: 'guardian',
    posture: 'guardian-resident',
    targets: [{ kind: 'repository', value: repository }],
    allowedActions: ['observe.telemetry', 'evidence.preserve'],
    limits: {
      maxRequestsPerMinute: 120,
      maxConcurrentActions: 4,
      maxDistinctTargets: 5,
      allowActiveValidation: false,
    },
  }
}

function signManifest(manifest: SecurityEngagementManifest): SignedSecurityEngagement {
  const signature = signEd25519(
    null,
    Buffer.from(serializeSecurityEngagementManifest(manifest), 'utf8'),
    signingKeys.privateKey,
  ).toString('base64')
  return {
    manifest,
    signature: { algorithm: 'Ed25519', keyId: TEST_KEY_ID, value: signature },
  }
}

function repoEvent(overrides: Partial<RepositoryPatrolEvent> = {}): RepositoryPatrolEvent {
  return {
    schema: REPOSITORY_PATROL_EVENT_SCHEMA,
    eventId: 'repo-event-1',
    repository: 'SignalBoost/signalboost-live',
    eventType: 'repository.workflow_change',
    occurredAt: '2026-09-10T21:00:00.000Z',
    source: 'github-audit-log',
    actorId: 'developer-17',
    sourceIp: '203.0.113.44',
    countryEstimate: 'US',
    asn: 'AS64500 example-provider',
    userAgent: 'authorized-audit-client/1.0',
    ref: 'refs/heads/main',
    commitSha: 'abcdef1234567890abcdef1234567890abcdef12',
    changedPaths: ['.github/workflows/pipeline-integrity.yml', 'package-lock.json'],
    ...overrides,
  }
}

const hostState = Object.freeze({
  now: '2026-09-10T21:01:00.000Z',
  killSwitchActive: false,
  requestsInCurrentMinute: 0,
  concurrentActions: 0,
  distinctTargetsTouched: 0,
  targetAlreadyCounted: false,
})

test('passive repository patrol records only authorized supplied telemetry as evidence', () => {
  const result = ingestRepositoryPatrolEvent({
    envelope: signManifest(repositoryManifest()),
    trustedKeys,
    hostState,
    event: repoEvent(),
    evidenceChain: [],
  })

  assert.equal(result.accepted, true)
  assert.equal(result.decision.allowed, true)
  assert.equal(result.evidenceChain.length, 1)
  const event = result.evidenceChain[0].event
  assert.deepEqual(event.target, { kind: 'repository', value: 'signalboost/signalboost-live' })
  assert.equal(event.attributionHypotheses.length, 0)
  assert.equal(event.observations.some(item => item.kind === 'source_ip' && item.value === '203.0.113.44'), true)
  assert.equal(event.observations.some(item => item.kind === 'country_estimate' && item.value === 'US'), true)
  assert.equal(event.observations.some(item => item.kind === 'provider_reported_actor' && item.value === 'developer-17'), true)
  assert.equal(result.indicators.some(item => item.code === 'workflow_control_change_observed'), true)
  assert.equal(result.indicators.some(item => item.code === 'workflow_path_changed'), true)
  assert.equal(result.indicators.some(item => item.code === 'dependency_lock_changed'), true)
})

test('repository patrol exact scope blocks neighboring repositories', () => {
  const result = ingestRepositoryPatrolEvent({
    envelope: signManifest(repositoryManifest('SignalBoost/signalboost-live')),
    trustedKeys,
    hostState,
    event: repoEvent({ repository: 'SignalBoost/signalboost-live-tools' }),
    evidenceChain: [],
  })
  assert.equal(result.accepted, false)
  assert.equal(result.reason, 'target_out_of_scope')
  assert.equal(result.evidenceChain.length, 0)
})

test('repository patrol never invents unavailable network identity evidence', () => {
  const result = ingestRepositoryPatrolEvent({
    envelope: signManifest(repositoryManifest()),
    trustedKeys,
    hostState,
    event: repoEvent({ sourceIp: undefined, countryEstimate: undefined, asn: undefined, userAgent: undefined }),
    evidenceChain: [],
  })
  assert.equal(result.accepted, true)
  const observations = result.evidenceChain[0].event.observations
  assert.equal(observations.some(item => item.kind === 'source_ip'), false)
  assert.equal(observations.some(item => item.kind === 'country_estimate'), false)
  assert.equal(observations.some(item => item.kind === 'asn_or_provider'), false)
  assert.equal(result.evidenceChain[0].event.attributionHypotheses.length, 0)
})

test('repository patrol fails closed for malformed telemetry, future events and replays', () => {
  const envelope = signManifest(repositoryManifest())
  const malformed = ingestRepositoryPatrolEvent({
    envelope,
    trustedKeys,
    hostState,
    event: repoEvent({ sourceIp: 'not-an-ip' }),
    evidenceChain: [],
  })
  assert.equal(malformed.accepted, false)
  assert.match(malformed.reason, /^repository_event_invalid:/)

  const future = ingestRepositoryPatrolEvent({
    envelope,
    trustedKeys,
    hostState,
    event: repoEvent({ occurredAt: '2026-09-10T21:10:01.000Z' }),
    evidenceChain: [],
  })
  assert.equal(future.accepted, false)
  assert.equal(future.reason, 'repository_event_from_future')

  const first = ingestRepositoryPatrolEvent({ envelope, trustedKeys, hostState, event: repoEvent(), evidenceChain: [] })
  const replay = ingestRepositoryPatrolEvent({ envelope, trustedKeys, hostState, event: repoEvent(), evidenceChain: first.evidenceChain })
  assert.equal(replay.accepted, false)
  assert.equal(replay.reason, 'repository_event_replayed')
  assert.equal(replay.evidenceChain.length, 1)
})

test('repository patrol refuses to append to a tampered evidence chain', () => {
  const envelope = signManifest(repositoryManifest())
  const first = ingestRepositoryPatrolEvent({ envelope, trustedKeys, hostState, event: repoEvent(), evidenceChain: [] })
  const tampered = first.evidenceChain.map(entry => ({ ...entry, hash: 'f'.repeat(64) })) as readonly SecurityEvidenceChainEntry[]
  const second = ingestRepositoryPatrolEvent({
    envelope,
    trustedKeys,
    hostState,
    event: repoEvent({ eventId: 'repo-event-2', eventType: 'repository.push' }),
    evidenceChain: tampered,
  })
  assert.equal(second.accepted, false)
  assert.equal(second.reason, 'evidence_chain_invalid')
  assert.equal(second.evidenceChain, tampered)
})

const GITHUB_TEST_SECRET = "It's a Secret to Everybody"

function githubSignature(rawBody: string, secret = GITHUB_TEST_SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(Buffer.from(rawBody, 'utf8')).digest('hex')}`
}

function githubHeaders(rawBody: string, overrides: Partial<GitHubWebhookDeliveryHeaders> = {}): GitHubWebhookDeliveryHeaders {
  return {
    signature256: githubSignature(rawBody),
    deliveryId: '72d3162e-cc78-11e3-81ab-4c9367dc0958',
    eventName: 'push',
    userAgent: 'GitHub-Hookshot/044aadd',
    hookId: '292430182',
    installationTargetType: 'repository',
    installationTargetId: '1193214194',
    ...overrides,
  }
}

test('GitHub webhook verifier matches the published HMAC-SHA256 test vector', () => {
  const verified = verifyGitHubWebhookDelivery({
    rawBody: 'Hello, World!',
    secret: GITHUB_TEST_SECRET,
    headers: {
      signature256: 'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17',
      deliveryId: '72d3162e-cc78-11e3-81ab-4c9367dc0958',
      eventName: 'push',
      userAgent: 'GitHub-Hookshot/044aadd',
    },
  })
  assert.equal(verified.valid, true)
})

test('authenticated GitHub push becomes provider-proven repository evidence without inventing actor IP', () => {
  const rawBody = JSON.stringify({
    forced: true,
    ref: 'refs/heads/main',
    after: 'abcdef1234567890abcdef1234567890abcdef12',
    repository: { full_name: 'SignalBoost/signalboost-live' },
    sender: { login: 'ghost' },
    commits: [{
      added: ['saas/security-host/new-control.ts'],
      modified: ['.github/workflows/pipeline-integrity.yml', 'package-lock.json'],
      removed: [],
    }],
  })
  const normalized = normalizeAuthenticatedGitHubRepositoryWebhook({
    rawBody,
    secret: GITHUB_TEST_SECRET,
    headers: githubHeaders(rawBody),
    receivedAt: '2026-09-10T21:00:00.000Z',
  })
  assert.equal(normalized.accepted, true)
  if (!normalized.accepted) return

  assert.equal(normalized.event.eventId, 'github:72d3162e-cc78-11e3-81ab-4c9367dc0958')
  assert.equal(normalized.event.eventType, 'repository.force_push')
  assert.equal(normalized.event.actorId, 'ghost')
  assert.equal(normalized.event.sourceIp, undefined)
  assert.equal(normalized.event.countryEstimate, undefined)
  assert.equal(normalized.event.sourceProvenance?.payloadSha256.length, 64)

  const ingested = ingestRepositoryPatrolEvent({
    envelope: signManifest(repositoryManifest()),
    trustedKeys,
    hostState,
    event: normalized.event,
    evidenceChain: [],
  })
  assert.equal(ingested.accepted, true)
  const observations = ingested.evidenceChain[0].event.observations
  assert.equal(observations.some(item => item.kind === 'provider_delivery_id' && item.value === normalized.provenance.deliveryId), true)
  assert.equal(observations.some(item => item.kind === 'provider_payload_sha256' && item.value === normalized.provenance.payloadSha256), true)
  assert.equal(observations.some(item => item.kind === 'provider_reported_actor' && item.value === 'ghost'), true)
  assert.equal(observations.some(item => item.kind === 'source_ip'), false)
  assert.equal(ingested.evidenceChain[0].event.attributionHypotheses.length, 0)
  assert.equal(ingested.indicators.some(item => item.code === 'history_rewrite_observed'), true)
  assert.equal(ingested.indicators.some(item => item.code === 'workflow_path_changed'), true)
})

test('GitHub webhook authentication fails closed on body tampering or spoofed delivery headers', () => {
  const originalBody = JSON.stringify({ repository: { full_name: 'SignalBoost/signalboost-live' }, forced: false })
  const headers = githubHeaders(originalBody)

  const tampered = verifyGitHubWebhookDelivery({
    rawBody: `${originalBody} `,
    secret: GITHUB_TEST_SECRET,
    headers,
  })
  assert.deepEqual(tampered, { valid: false, reason: 'github_signature_invalid' })

  const spoofedAgent = verifyGitHubWebhookDelivery({
    rawBody: originalBody,
    secret: GITHUB_TEST_SECRET,
    headers: { ...headers, userAgent: 'curl/8.0' },
  })
  assert.deepEqual(spoofedAgent, { valid: false, reason: 'github_user_agent_invalid' })

  const missingDelivery = verifyGitHubWebhookDelivery({
    rawBody: originalBody,
    secret: GITHUB_TEST_SECRET,
    headers: { ...headers, deliveryId: '' },
  })
  assert.deepEqual(missingDelivery, { valid: false, reason: 'github_delivery_id_invalid' })
})

test('signed but unsupported GitHub webhook events are not mislabeled as repository patrol activity', () => {
  const rawBody = JSON.stringify({
    action: 'opened',
    repository: { full_name: 'SignalBoost/signalboost-live' },
    sender: { login: 'developer-17' },
  })
  const result = normalizeAuthenticatedGitHubRepositoryWebhook({
    rawBody,
    secret: GITHUB_TEST_SECRET,
    headers: githubHeaders(rawBody, { eventName: 'issues' }),
    receivedAt: '2026-09-10T21:00:00.000Z',
  })
  assert.deepEqual(result, { accepted: false, reason: 'github_event_not_supported_for_repository_patrol' })
})

test('direct GitHub-webhook events without authenticated source provenance are refused', () => {
  const result = ingestRepositoryPatrolEvent({
    envelope: signManifest(repositoryManifest()),
    trustedKeys,
    hostState,
    event: repoEvent({ source: 'github-webhook', sourceProvenance: undefined }),
    evidenceChain: [],
  })
  assert.equal(result.accepted, false)
  assert.match(result.reason, /sourceProvenance:required_for_github_webhook/)
})
