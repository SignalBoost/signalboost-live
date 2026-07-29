// saas/tests/supervisorReleaseBlockers.node.test.ts

import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import test from 'node:test'

import { APIExecutor } from '../lib/supervisor/executors/api-executor.ts'
import { classifyStep } from '../lib/supervisor/executors/api-danger-policy.ts'
import { createApiCapabilityRegistry } from '../lib/supervisor/executors/api-capability-registry.ts'
import {
  APPROVAL_CONTINUATION_SCHEMA_VERSION,
  canonicalApprovalPayload,
  createEd25519ApprovalVerifier,
  InMemoryApprovalNonceStore,
  type ApprovalContinuationProof,
} from '../lib/supervisor/executors/approval-continuation.ts'
import { InMemoryDispatchStore } from '../lib/supervisor/executors/dispatch-store.ts'
import { createEnterpriseNotifier } from '../lib/supervisor/portable/enterprise-notifier.ts'
import { approvalCopy } from '../lib/supervisor/portable/notification-copy.ts'
import { createLicensedSelfHealingSupervisor } from '../lib/supervisor/portable/licensed-supervisor.ts'
import { generateIssuerKeyPair, issueLicense, type PortableLicenseClaims } from '../portable-license/index.ts'

const NOW = Date.parse('2026-07-28T20:00:00.000Z')

function incident(incidentId = 'incident-1') {
  return {
    incidentId,
    provider: 'example-cloud',
    environment: 'staging',
    severity: 'critical',
    detectedAt: new Date(NOW).toISOString(),
    source: 'api',
    errorMessage: 'Synthetic release-gate incident.',
    evidence: [{ evidenceId: 'evidence-1', type: 'log', capturedAt: new Date(NOW).toISOString(), summary: 'synthetic' }],
    metadata: {},
  }
}

function apiStep(overrides: Record<string, unknown> = {}) {
  return {
    stepId: 'step-1',
    action: 'api_request',
    description: 'Apply the requested state.',
    protectedAction: true,
    parameters: {
      actionId: 'restart-service',
      method: 'POST',
      resource: '/services/api/actions/restart',
    },
    ...overrides,
  }
}

function plan(step = apiStep(), planId = 'plan-1') {
  return {
    planId,
    incidentId: 'incident-1',
    diagnosis: 'Synthetic diagnosis.',
    confidenceScore: 100,
    requiresBrowser: false,
    riskLevel: 'high',
    targetProvider: 'example-cloud',
    targetEnvironment: 'staging',
    steps: [step],
    verificationSteps: [{ stepId: 'verify-1', action: 'verify', description: 'Verify status.', protectedAction: false, parameters: { resource: '/services/api' } }],
    generatedAt: new Date(NOW).toISOString(),
    schemaVersion: 'supervisor-plan-v1',
  }
}

function executorInput(step = apiStep(), dispatchId = 'dispatch-1') {
  return {
    incident: incident() as never,
    plan: plan(step) as never,
    approvedStepIds: ['step-1'],
    executionContext: { executionId: `${dispatchId}-execution`, metadata: {} },
    dispatch: { dispatchId, requestedExecutorKind: 'api', requestedAt: new Date(NOW).toISOString() },
  }
}

function approvalKeys() {
  const pair = generateKeyPairSync('ed25519')
  return {
    privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  }
}

function signedProof(privateKeyPem: string, overrides: Partial<ApprovalContinuationProof> = {}): ApprovalContinuationProof {
  const unsigned: ApprovalContinuationProof = {
    schemaVersion: APPROVAL_CONTINUATION_SCHEMA_VERSION,
    incidentId: 'incident-1',
    planId: 'plan-1',
    dispatchId: 'dispatch-continuation-1',
    approvedStepIds: ['step-1'],
    approverId: 'approver-1',
    approvedAt: new Date(NOW - 60_000).toISOString(),
    expiresAt: new Date(NOW + 10 * 60_000).toISOString(),
    nonce: 'nonce-1',
    keyId: 'approval-key-1',
    previousAuditEventId: 'pause-event-1',
    signature: '',
    ...overrides,
  }
  return {
    ...unsigned,
    signature: sign(null, Buffer.from(canonicalApprovalPayload(unsigned), 'utf8'), privateKeyPem).toString('base64url'),
  }
}

test('unknown and adversarial API mutations pause by default', () => {
  const cases = [
    apiStep({ parameters: { actionId: 'terminate', method: 'POST', resource: '/instances/abc/actions/terminate' } }),
    apiStep({ parameters: { actionId: 'scale', method: 'PATCH', resource: '/deployments/api', desiredReplicas: 0 } }),
    apiStep({ parameters: { actionId: 'permissions', method: 'PUT', resource: '/access', access: { administrators: [] } } }),
    apiStep({ description: 'Aplicar el estado solicitado.', parameters: { actionId: 'shutdown', method: 'POST', resource: '/systems/primary/actions/shutdown' } }),
    apiStep({ description: 'Apply requested state.', parameters: { actionId: 'replacePrimary', method: 'PATCH', resource: '/database/primary' } }),
  ]

  for (const step of cases) {
    const verdict = classifyStep(step as never, 'example-cloud')
    assert.equal(verdict.dangerous, true, JSON.stringify(step.parameters))
    assert.match(verdict.reason, /Unknown provider\/action capability/)
  }
})

test('only an exact registered reversible capability auto-executes', async () => {
  const registry = createApiCapabilityRegistry([{
    provider: 'example-cloud',
    actionId: 'restart-service',
    mutation: true,
    riskClass: 'routine_reversible',
    approvalRequired: false,
    autoExecutable: true,
    methods: ['POST'],
    resourcePattern: /^\/services\/[a-z0-9-]+\/actions\/restart$/,
    validateParameters: parameters => parameters.confirmed === true,
    maximumExecutionsPerDispatch: 1,
  }])
  const calls: string[] = []
  const executor = new APIExecutor({
    capabilityRegistry: registry,
    runner: async step => {
      calls.push(step.stepId)
      return { ok: true, summary: 'recording runner accepted exact capability' }
    },
  })

  const exact = apiStep({ parameters: { actionId: 'restart-service', method: 'POST', resource: '/services/api/actions/restart', confirmed: true } })
  const accepted = await executor.execute(executorInput(exact) as never)
  assert.equal(accepted.status, 'completed')
  assert.deepEqual(calls, ['step-1'])

  const wrongSchema = apiStep({ parameters: { actionId: 'restart-service', method: 'POST', resource: '/services/api/actions/restart', confirmed: false } })
  const refused = await executor.execute(executorInput(wrongSchema, 'dispatch-2') as never)
  assert.equal(refused.status, 'paused_for_approval')
  assert.deepEqual(calls, ['step-1'])
})

test('signed approval continuation executes exact scope once and rejects replay', async () => {
  const keys = approvalKeys()
  const nonceStore = new InMemoryApprovalNonceStore()
  const verifier = createEd25519ApprovalVerifier({
    publicKeyFor: keyId => keyId === 'approval-key-1' ? keys.publicKeyPem : undefined,
    nonceStore,
    previousAuditEventExists: input => input.eventId === 'pause-event-1' && input.incidentId === 'incident-1' && input.planId === 'plan-1',
    now: () => new Date(NOW),
  })
  const calls: string[] = []
  const executor = new APIExecutor({
    approvalVerifier: verifier,
    runner: async step => {
      calls.push(step.stepId)
      return { ok: true, summary: 'approved consequential action executed' }
    },
  })
  const proof = signedProof(keys.privateKeyPem)
  const input = {
    ...executorInput(apiStep({ parameters: { actionId: 'shutdown', method: 'POST', resource: '/systems/primary/actions/shutdown' } }), proof.dispatchId),
    approvalContinuation: proof,
  }

  const first = await executor.execute(input as never)
  assert.equal(first.status, 'completed')
  assert.deepEqual(calls, ['step-1'])
  assert.ok(first.evidence.some(event => event.type === 'api_approval_continuation_accepted'))

  const replay = await executor.execute(input as never)
  assert.equal(replay.status, 'paused_for_approval')
  assert.deepEqual(calls, ['step-1'])
})

test('tampered, expired and unbound approval proofs fail closed', async () => {
  const keys = approvalKeys()
  const createVerifier = () => createEd25519ApprovalVerifier({
    publicKeyFor: () => keys.publicKeyPem,
    nonceStore: new InMemoryApprovalNonceStore(),
    previousAuditEventExists: input => input.eventId === 'pause-event-1',
    now: () => new Date(NOW),
  })
  const context = { incidentId: 'incident-1', planId: 'plan-1', dispatchId: 'dispatch-continuation-1', approvedStepIds: ['step-1'] }

  const tampered = signedProof(keys.privateKeyPem)
  tampered.approverId = 'different-approver'
  assert.equal((await createVerifier().verify(tampered, context)).valid, false)

  const expired = signedProof(keys.privateKeyPem, {
    approvedAt: new Date(NOW - 20 * 60_000).toISOString(),
    expiresAt: new Date(NOW - 10 * 60_000).toISOString(),
    nonce: 'nonce-expired',
  })
  assert.match((await createVerifier().verify(expired, context)).reason, /expired/)

  const wrongScope = signedProof(keys.privateKeyPem, { approvedStepIds: ['step-other'], nonce: 'nonce-scope' })
  assert.match((await createVerifier().verify(wrongScope, context)).reason, /scope/)

  const missingEvent = signedProof(keys.privateKeyPem, { previousAuditEventId: 'unknown-event', nonce: 'nonce-event' })
  assert.match((await createVerifier().verify(missingEvent, context)).reason, /prior pause event/)
})

test('enterprise notifications use all five locale catalogues without changing identifiers', async () => {
  for (const locale of ['en', 'es', 'pt-BR', 'pl', 'ru']) {
    const notifications: Record<string, unknown>[] = []
    const notifier = createEnterpriseNotifier({
      secrets: { async getSecret() { return undefined } },
      notifications: { async notify(notification) { notifications.push(notification as unknown as Record<string, unknown>) } },
      approvers: { async approversFor() { return [{ id: 'approver-1', address: 'approver@example.test' }] } },
      branding: { productName: 'Buyer Supervisor', locale },
    })
    await notifier({
      dispatchId: 'dispatch-locale',
      incidentId: 'incident-locale',
      step: apiStep({ description: '' }) as never,
      verdict: { dangerous: true, category: 'credential_security', reason: 'machine-stable-reason' },
    })
    assert.equal(notifications.length, 1)
    assert.match(String(notifications[0].title), new RegExp(approvalCopy(locale).heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.equal(notifications[0].category, 'credential_security')
    assert.equal(notifications[0].stepId, 'step-1')
    assert.equal(notifications[0].incidentId, 'incident-locale')
    assert.equal(notifications[0].dispatchId, 'dispatch-locale')
    assert.equal(notifications[0].stepDescription, approvalCopy(locale).noDescription)
  }
})

test('packaged factory refuses incomplete licence configuration and guards paid paths', async () => {
  const issuerKeys = generateIssuerKeyPair()
  const claims: PortableLicenseClaims = {
    schema: 'portable-license/1',
    licenseId: 'lic-release-test',
    issuer: 'release-test-issuer',
    licensee: 'Evaluation Buyer',
    productId: 'self-healing-supervisor',
    edition: 'enterprise',
    features: ['repair.plan', 'repair.dispatch'],
    seats: 5,
    maxExecutions: null,
    issuedAt: new Date(NOW - 60_000).toISOString(),
    notBefore: new Date(NOW - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
    graceDays: 0,
  }
  const token = issueLicense(claims, issuerKeys.privateKeyPem)
  const common = {
    host: {
      secrets: { async getSecret() { return undefined } },
      notifications: { async notify() {} },
      approvers: { async approversFor() { return [{ id: 'approver-1', address: 'approver@example.test' }] } },
      branding: { productName: 'Buyer Supervisor', locale: 'en' },
    },
    audit: { async write() {} },
    dispatchStore: new InMemoryDispatchStore(),
    apiRunner: async () => ({ ok: true, summary: 'test runner' }),
    apiCapabilities: createApiCapabilityRegistry([]),
    approvalVerifier: { async verify() { return { valid: false, reason: 'not used' } } },
    thinker: { async proposeRepairPlan() { return { ok: true } } },
  }

  assert.throws(() => createLicensedSelfHealingSupervisor({
    ...common,
    license: { token: '', issuer: 'release-test-issuer', publicKeysPem: [issuerKeys.publicKeyPem] },
  } as never), /license\.token is required/)

  const licensed = createLicensedSelfHealingSupervisor({
    ...common,
    license: { token, issuer: 'release-test-issuer', publicKeysPem: [issuerKeys.publicKeyPem] },
  } as never)
  assert.deepEqual(await licensed.thinker.proposeRepairPlan(incident() as never), { ok: true })

  const invalid = createLicensedSelfHealingSupervisor({
    ...common,
    dispatchStore: new InMemoryDispatchStore(),
    license: { token: 'not-a-license', issuer: 'release-test-issuer', publicKeysPem: [issuerKeys.publicKeyPem] },
  } as never)
  await assert.rejects(() => invalid.thinker.proposeRepairPlan(incident() as never), /was not executed|licence/i)
})
