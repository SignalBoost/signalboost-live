import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign as signEd25519 } from 'node:crypto'
import { mkdtemp, writeFile, mkdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createRepositoryManifest } from '../lib/repository-intelligence/index.ts'
import {
  REPOSITORY_PATROL_EVENT_SCHEMA,
  SECURITY_ENGAGEMENT_SCHEMA,
  ingestRepositoryPatrolEvent,
  serializeSecurityEngagementManifest,
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
