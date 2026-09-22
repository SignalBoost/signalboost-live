import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  AgentRequest,
  ConsequenceClass,
  GatewayHost,
  GovernancePolicy,
} from '../agent-gateway/types.ts'
import {
  HARNESS_PROFILES,
  classifyHarnessResult,
  createGovernedHarnessExecutor,
  createTrajectoryJournal,
  resolveHarnessManifest,
  type HarnessAuthorityEnvelope,
  type HarnessRunRequest,
} from '../platform-harness/index.ts'

const authority: HarnessAuthorityEnvelope = {
  manifestRef: 'referee://manifest/123',
  verified: true,
  verifiedBy: 'referee',
  environments: ['synthetic', 'sandbox', 'production'],
  capabilities: [
    { id: 'github.read', environments: ['sandbox', 'production'], mutating: false },
    { id: 'github.write', environments: ['sandbox', 'production'], mutating: true },
    { id: 'production.deploy', environments: ['production'], mutating: true },
  ],
  limits: { maxCostUsd: 10, maxToolCalls: 500, deadlineMs: 3_600_000, maxConcurrency: 8 },
}

function request(overrides: Partial<HarnessRunRequest> = {}): HarnessRunRequest {
  return {
    runId: 'run-1',
    objective: 'repair a controlled broken application and prove the result',
    identity: {
      agentId: 'builder-1',
      role: 'builder',
      artifact: { artifactId: 'artifact-1' },
    },
    profile: 'residency',
    environment: { environmentId: 'sandbox-1', class: 'sandbox' },
    requestedCapabilities: ['github.read', 'github.write'],
    requestedLimits: {
      maxCostUsd: 2,
      maxToolCalls: 50,
      deadlineMs: 120_000,
      maxConcurrency: 1,
    },
    ...overrides,
  }
}

test('canonical profiles are one shared harness surface', () => {
  assert.deepEqual(HARNESS_PROFILES, [
    'residency',
    'production',
    'sandbox',
    'self_healing',
    'security_lab',
    'replay',
    'evaluation_runtime',
  ])
})

test('Residency uses the shared harness but cannot target Production', () => {
  const decision = resolveHarnessManifest(
    request({ environment: { environmentId: 'prod-1', class: 'production' } }),
    authority,
  )
  assert.equal(decision.allowed, false)
  if (!decision.allowed) assert.ok(decision.reasons.includes('profile_environment_forbidden'))
})

test('a harness profile cannot mint a capability outside trusted authority', () => {
  const decision = resolveHarnessManifest(
    request({ requestedCapabilities: ['github.read', 'vercel.deploy'] }),
    authority,
  )
  assert.equal(decision.allowed, false)
  if (!decision.allowed) {
    assert.ok(decision.reasons.includes('capability_not_authorized:vercel.deploy'))
  }
})

test('resolved limits are reduced rather than widened', () => {
  const decision = resolveHarnessManifest(request({
    requestedLimits: {
      maxCostUsd: 50,
      maxToolCalls: 1_000,
      deadlineMs: 9_000_000,
      maxConcurrency: 20,
    },
  }), authority)
  assert.equal(decision.allowed, true)
  if (!decision.allowed) return
  assert.equal(decision.manifest.limits.maxCostUsd, 10)
  assert.equal(decision.manifest.limits.maxToolCalls, 200)
  assert.equal(decision.manifest.limits.deadlineMs, 1_800_000)
  assert.equal(decision.manifest.limits.maxConcurrency, 8)
})

test('replay is read-only even when authority contains a mutating capability', () => {
  const decision = resolveHarnessManifest(request({
    profile: 'replay',
    requestedCapabilities: ['github.write'],
  }), authority)
  assert.equal(decision.allowed, false)
  if (!decision.allowed) {
    assert.ok(decision.reasons.includes('profile_mutation_forbidden:github.write'))
  }
})

test('trajectory journal rejects private reasoning persistence', () => {
  const journal = createTrajectoryJournal('run-1', () => new Date('2026-09-22T22:00:00Z'))
  journal.append({ kind: 'run_started', summary: 'Builder residency case started.' })
  assert.throws(
    () => journal.append({
      kind: 'observation',
      summary: 'unsafe event',
      data: { chainOfThought: 'must never be persisted' },
    }),
    /harness_private_reasoning_persistence_forbidden/,
  )
  assert.equal(journal.snapshot().length, 1)
})

test('failure ownership remains separated', () => {
  assert.equal(classifyHarnessResult({ infrastructureFailure: true }).destination, 'self_healing')
  assert.equal(classifyHarnessResult({ agentCompetencyFailure: true }).destination, 'university_remediation')
  assert.equal(classifyHarnessResult({ authorityBoundaryReached: true }).destination, 'referee_guardian')
  assert.equal(classifyHarnessResult({
    executionCompleted: true,
    verification: { verified: true, verifierRef: 'verifier://1', evidenceRefs: ['evidence://1'] },
  }).destination, 'durable_evidence')
})

test('harness execution still goes through the existing Governed Socket', async () => {
  const decision = resolveHarnessManifest(
    request({ requestedCapabilities: ['github.read', 'github.write'] }),
    authority,
  )
  assert.equal(decision.allowed, true)
  if (!decision.allowed) return

  let performed = 0
  const classifier = {
    classify(agentRequest: AgentRequest): ConsequenceClass {
      return agentRequest.action.kind === 'write' ? 'external_effect' : 'reversible_internal'
    },
  }
  const policy: GovernancePolicy = {
    classifier,
    allowlist: [
      { actionKind: 'read', target: 'github.read', rollback: 'no-op' },
      { actionKind: 'write', target: 'github.write', rollback: 'git-revert' },
    ],
  }
  const host: GatewayHost = {
    execution: {
      async perform() {
        performed += 1
        return { ok: true, result: { ok: true } }
      },
    },
  }

  const executor = createGovernedHarnessExecutor({ policy, host })

  const read = await executor.execute(decision.manifest, {
    actionId: 'read-1',
    kind: 'read',
    capabilityId: 'github.read',
  })
  assert.equal(read.status, 'executed')
  assert.equal(performed, 1)

  const write = await executor.execute(decision.manifest, {
    actionId: 'write-1',
    kind: 'write',
    capabilityId: 'github.write',
  })
  assert.equal(write.status, 'authority_boundary')
  assert.equal(write.gatewayOutcome?.verdict, 'halt_for_approval')
  assert.equal(performed, 1)
})
