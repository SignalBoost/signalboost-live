import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign as signEd25519 } from 'node:crypto'

import { DEFAULT_SANDBOX_RUNTIME_POLICY, assertSafeSandboxRuntimePolicy, validateSandboxRuntimePolicy } from '../lib/agent-runtime/policy.ts'
import { DisabledCodeSandboxProvider } from '../lib/agent-runtime/providers/disabled-provider.ts'
import {
  SECURITY_ENGAGEMENT_SCHEMA,
  createStrangerSecuritySessionView,
  serializeSecurityEngagementManifest,
  verifySignedSecurityEngagement,
  type SecurityEngagementManifest,
  type SignedSecurityEngagement,
} from '../security-host/engagement.ts'
import { authorizeSecurityAction, type SecurityHostState } from '../security-host/referee.ts'
import {
  appendSecurityEvidence,
  verifySecurityEvidenceChain,
  type SecurityEvidenceChainEntry,
} from '../security-host/evidence.ts'

test('agent runtime defaults are conservative and immutable', () => {
  assert.equal(DEFAULT_SANDBOX_RUNTIME_POLICY.maximumCorrectionAttempts, 3)
  assert.equal(DEFAULT_SANDBOX_RUNTIME_POLICY.outboundNetwork, false)
  assert.equal(DEFAULT_SANDBOX_RUNTIME_POLICY.inheritEnvironment, false)
  assert.equal(DEFAULT_SANDBOX_RUNTIME_POLICY.hostFilesystemAccess, false)
  assert.equal(DEFAULT_SANDBOX_RUNTIME_POLICY.repositoryWrites, false)
  assert.equal(Object.isFrozen(DEFAULT_SANDBOX_RUNTIME_POLICY), true)
  assert.deepEqual(validateSandboxRuntimePolicy(DEFAULT_SANDBOX_RUNTIME_POLICY), [])
})

test('unsafe policy values are rejected without weakening permissions', () => {
  const invalid = { ...DEFAULT_SANDBOX_RUNTIME_POLICY, maximumCorrectionAttempts: 4, outboundNetwork: true, hostFilesystemAccess: true, privilegedExecution: true, dockerSocketAccess: true, repositoryWrites: true, automaticDeployment: true, automaticMerge: true }
  const fields = validateSandboxRuntimePolicy(invalid).map(issue => issue.field)
  assert.deepEqual(fields, ['maximumCorrectionAttempts', 'outboundNetwork', 'hostFilesystemAccess', 'privilegedExecution', 'dockerSocketAccess', 'repositoryWrites', 'automaticDeployment', 'automaticMerge'])
  assert.throws(() => assertSafeSandboxRuntimePolicy(invalid))
  assert.throws(() => assertSafeSandboxRuntimePolicy({ ...DEFAULT_SANDBOX_RUNTIME_POLICY, maximumCommandExecutionTimeMs: 0 }))
})

test('disabled provider never executes, returns structured failure, and cleanup is idempotent', async () => {
  const provider = new DisabledCodeSandboxProvider()
  const session = await provider.createSession({ workspaceId: 'work', declaredWorkspacePath: 'workspace', capabilities: [] })
  const result = await provider.execute(session, { requestId: 'request', language: 'typescript', stage: 'execution', source: 'throw new Error()', workingDirectory: '.', timeoutMs: 1 })
  assert.equal(result.exitCode, 125)
  assert.equal(result.error?.code, 'sandbox_unavailable')
  assert.equal(result.artifacts.length, 0)
  await provider.destroySession(session)
  await provider.destroySession(session)
})

const signingKeys = generateKeyPairSync('ed25519')
const TEST_KEY_ID = 'security-test-key'
const trustedKeys = Object.freeze({
  [TEST_KEY_ID]: signingKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
})

function guardianManifest(overrides: Partial<SecurityEngagementManifest> = {}): SecurityEngagementManifest {
  return {
    schema: SECURITY_ENGAGEMENT_SCHEMA,
    engagementId: 'engagement-guardian-1',
    approvedBy: 'security-owner',
    issuedAt: '2026-09-10T20:00:00.000Z',
    notBefore: '2026-09-10T20:00:00.000Z',
    expiresAt: '2026-09-10T23:00:00.000Z',
    role: 'guardian',
    posture: 'guardian-resident',
    targets: [
      { kind: 'domain', value: 'corp.example' },
      { kind: 'cidr', value: '10.20.0.0/16' },
    ],
    allowedActions: ['observe.telemetry', 'discover.passive', 'scan.safe', 'evidence.preserve', 'contain.policy', 'remediate.policy', 'verify.defensive'],
    limits: {
      maxRequestsPerMinute: 120,
      maxConcurrentActions: 4,
      maxDistinctTargets: 20,
      allowActiveValidation: false,
    },
    ...overrides,
  }
}

function strangerManifest(overrides: Partial<SecurityEngagementManifest> = {}): SecurityEngagementManifest {
  return {
    schema: SECURITY_ENGAGEMENT_SCHEMA,
    engagementId: 'engagement-stranger-1',
    approvedBy: 'security-owner',
    issuedAt: '2026-09-10T20:00:00.000Z',
    notBefore: '2026-09-10T20:00:00.000Z',
    expiresAt: '2026-09-10T23:00:00.000Z',
    role: 'stranger',
    posture: 'internet-stranger',
    targets: [{ kind: 'host', value: 'training.corp.example' }],
    allowedActions: ['discover.passive', 'scan.safe', 'validate.bounded', 'evidence.preserve', 'verify.retest'],
    limits: {
      maxRequestsPerMinute: 30,
      maxConcurrentActions: 2,
      maxDistinctTargets: 4,
      allowActiveValidation: true,
    },
    scenarioGrantIds: ['external-perspective'],
    strangerDisclosures: ['public-dns'],
    ...overrides,
  }
}

function signedManifest(manifest: SecurityEngagementManifest): SignedSecurityEngagement {
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

function hostState(overrides: Partial<SecurityHostState> = {}): SecurityHostState {
  return {
    now: '2026-09-10T21:00:00.000Z',
    killSwitchActive: false,
    requestsInCurrentMinute: 0,
    concurrentActions: 0,
    distinctTargetsTouched: 0,
    targetAlreadyCounted: false,
    ...overrides,
  }
}

test('signed security engagements authorize only in-scope host-controlled actions', () => {
  const envelope = signedManifest(guardianManifest())
  assert.equal(verifySignedSecurityEngagement(envelope, trustedKeys).valid, true)

  const domainDecision = authorizeSecurityAction({
    envelope,
    trustedKeys,
    request: {
      engagementId: envelope.manifest.engagementId,
      role: 'guardian',
      action: 'scan.safe',
      target: { kind: 'host', value: 'api.corp.example' },
    },
    hostState: hostState(),
  })
  assert.equal(domainDecision.allowed, true)

  const cidrDecision = authorizeSecurityAction({
    envelope,
    trustedKeys,
    request: {
      engagementId: envelope.manifest.engagementId,
      role: 'guardian',
      action: 'observe.telemetry',
      target: { kind: 'ip', value: '10.20.14.9' },
    },
    hostState: hostState(),
  })
  assert.equal(cidrDecision.allowed, true)

  const siblingDomain = authorizeSecurityAction({
    envelope,
    trustedKeys,
    request: {
      engagementId: envelope.manifest.engagementId,
      role: 'guardian',
      action: 'scan.safe',
      target: { kind: 'host', value: 'corp.example.attacker.invalid' },
    },
    hostState: hostState(),
  })
  assert.equal(siblingDomain.allowed, false)
  assert.equal(siblingDomain.reason, 'target_out_of_scope')
})

test('Referee fails closed for signature tampering, expiry, kill switch and host limits', () => {
  const envelope = signedManifest(guardianManifest())
  const tampered = {
    ...envelope,
    manifest: { ...envelope.manifest, expiresAt: '2026-09-11T23:00:00.000Z' },
  }
  const baseRequest = {
    engagementId: envelope.manifest.engagementId,
    role: 'guardian' as const,
    action: 'observe.telemetry' as const,
    target: { kind: 'host' as const, value: 'corp.example' },
  }

  assert.equal(authorizeSecurityAction({ envelope: tampered, trustedKeys, request: baseRequest, hostState: hostState() }).reason, 'signature_invalid')
  assert.equal(authorizeSecurityAction({ envelope, trustedKeys, request: baseRequest, hostState: hostState({ now: '2026-09-10T23:00:00.000Z' }) }).reason, 'engagement_expired')
  assert.equal(authorizeSecurityAction({ envelope, trustedKeys, request: baseRequest, hostState: hostState({ killSwitchActive: true }) }).reason, 'kill_switch_active')
  assert.equal(authorizeSecurityAction({ envelope, trustedKeys, request: baseRequest, hostState: hostState({ requestsInCurrentMinute: 120 }) }).reason, 'request_rate_limit_reached')
  assert.equal(authorizeSecurityAction({ envelope, trustedKeys, request: baseRequest, hostState: hostState({ concurrentActions: 4 }) }).reason, 'concurrency_limit_reached')
})

test('Referee rejects malformed runtime requests without throwing or widening scope', () => {
  const envelope = signedManifest(guardianManifest())
  const malformedRequests = [
    null,
    {},
    { engagementId: envelope.manifest.engagementId, role: 'guardian', action: 'scan.safe', target: null },
    { engagementId: envelope.manifest.engagementId, role: 'guardian', action: 'unknown.action', target: { kind: 'host', value: 'corp.example' } },
    { engagementId: envelope.manifest.engagementId, role: 'guardian', action: 'scan.safe', target: { kind: 'unknown', value: 'corp.example' } },
    { engagementId: envelope.manifest.engagementId, role: 'guardian', action: 'scan.safe', target: { kind: 'host', value: 'https://evil.invalid/.corp.example' } },
  ]

  for (const request of malformedRequests) {
    const decision = authorizeSecurityAction({ envelope, trustedKeys, request, hostState: hostState() })
    assert.equal(decision.allowed, false)
    assert.equal(decision.reason, 'invalid_request')
  }
})

test('Stranger session is signed, time-bounded and cannot inherit Guardian private context', () => {
  const taintedManifest = {
    ...strangerManifest(),
    guardianMemory: 'must-never-cross-the-boundary',
    priorVulnerabilities: ['hidden-finding'],
  } as SecurityEngagementManifest
  const envelope = signedManifest(taintedManifest)
  const view = createStrangerSecuritySessionView(envelope, trustedKeys, '2026-09-10T21:00:00.000Z') as any

  assert.equal(view.role, 'stranger')
  assert.deepEqual(view.scenarioGrantIds, ['external-perspective'])
  assert.deepEqual(view.allowedDisclosures, ['public-dns'])
  assert.equal(view.guardianMemory, undefined)
  assert.equal(view.priorVulnerabilities, undefined)
  assert.equal(view.approvedBy, undefined)

  const validation = authorizeSecurityAction({
    envelope,
    trustedKeys,
    request: {
      engagementId: envelope.manifest.engagementId,
      role: 'stranger',
      action: 'validate.bounded',
      target: { kind: 'host', value: 'training.corp.example' },
    },
    hostState: hostState(),
  })
  assert.equal(validation.allowed, true)

  const containment = authorizeSecurityAction({
    envelope,
    trustedKeys,
    request: {
      engagementId: envelope.manifest.engagementId,
      role: 'stranger',
      action: 'contain.policy',
      target: { kind: 'host', value: 'training.corp.example' },
    },
    hostState: hostState(),
  })
  assert.equal(containment.allowed, false)
  assert.equal(containment.reason, 'action_not_permitted')
})

test('incident evidence is hash-chained and keeps observation separate from attribution', () => {
  let chain: readonly SecurityEvidenceChainEntry[] = []
  chain = appendSecurityEvidence(chain, {
    eventId: 'event-1',
    engagementId: 'engagement-guardian-1',
    recordedAt: '2026-09-10T21:01:00.000Z',
    actorRole: 'guardian',
    action: 'observe.telemetry',
    decision: 'observed',
    target: { kind: 'host', value: 'corp.example' },
    observations: [{
      id: 'obs-source-ip',
      kind: 'source_ip',
      source: 'edge-access-log',
      collectedAt: '2026-09-10T21:00:59.000Z',
      value: '203.0.113.44',
    }],
    attributionHypotheses: [{
      id: 'hypothesis-relay',
      hypothesis: 'The source may be a relay rather than the human operator.',
      confidence: 0.25,
      basisObservationIds: ['obs-source-ip'],
      alternatives: ['VPN or proxy', 'compromised host', 'shared cloud infrastructure'],
    }],
  })
  chain = appendSecurityEvidence(chain, {
    eventId: 'event-2',
    engagementId: 'engagement-guardian-1',
    recordedAt: '2026-09-10T21:02:00.000Z',
    actorRole: 'guardian',
    action: 'evidence.preserve',
    decision: 'verified',
    observations: [{
      id: 'obs-repo-event',
      kind: 'repository_access',
      source: 'authorized-audit-log',
      collectedAt: '2026-09-10T21:01:58.000Z',
      value: 'sensitive-project-read',
    }],
    attributionHypotheses: [],
  })

  assert.equal(verifySecurityEvidenceChain(chain), true)
  assert.equal('target' in chain[1].event, false)
  assert.notEqual(chain[0].hash, chain[1].hash)
  assert.equal(chain[0].event.observations[0].value, '203.0.113.44')
  assert.equal(chain[0].event.attributionHypotheses[0].confidence, 0.25)

  const tampered = chain.map((entry, index) => index === 0
    ? {
        ...entry,
        event: {
          ...entry.event,
          observations: [{ ...entry.event.observations[0], value: '198.51.100.99' }],
        },
      }
    : entry) as any
  assert.equal(verifySecurityEvidenceChain(tampered), false)

  assert.throws(() => appendSecurityEvidence([], {
    eventId: 'bad-attribution',
    engagementId: 'engagement-guardian-1',
    recordedAt: '2026-09-10T21:03:00.000Z',
    actorRole: 'guardian',
    action: 'evidence.preserve',
    decision: 'observed',
    observations: [],
    attributionHypotheses: [{
      id: 'unsupported-identity',
      hypothesis: 'Unsupported identity claim',
      confidence: 0.9,
      basisObservationIds: ['missing-observation'],
      alternatives: ['VPN or proxy'],
    }],
  }), /security_attribution_basis_invalid/)

  const observedIp = {
    id: 'obs-attribution-ip',
    kind: 'source_ip',
    source: 'edge-access-log',
    collectedAt: '2026-09-10T21:03:30.000Z',
    value: '203.0.113.55',
  }
  assert.throws(() => appendSecurityEvidence([], {
    eventId: 'empty-attribution-basis',
    engagementId: 'engagement-guardian-1',
    recordedAt: '2026-09-10T21:04:00.000Z',
    actorRole: 'guardian',
    action: 'evidence.preserve',
    decision: 'observed',
    observations: [observedIp],
    attributionHypotheses: [{
      id: 'unsupported-empty-basis',
      hypothesis: 'Identity claim without evidence basis',
      confidence: 1,
      basisObservationIds: [],
      alternatives: ['VPN or proxy'],
    }],
  }), /security_attribution_basis_invalid/)

  assert.throws(() => appendSecurityEvidence([], {
    eventId: 'empty-attribution-alternatives',
    engagementId: 'engagement-guardian-1',
    recordedAt: '2026-09-10T21:05:00.000Z',
    actorRole: 'guardian',
    action: 'evidence.preserve',
    decision: 'observed',
    observations: [observedIp],
    attributionHypotheses: [{
      id: 'unsupported-no-alternatives',
      hypothesis: 'Identity claim without competing explanations',
      confidence: 0.8,
      basisObservationIds: ['obs-attribution-ip'],
      alternatives: [],
    }],
  }), /security_attribution_alternatives_invalid/)
})
