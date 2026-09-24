import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolveChildHarnessManifest,
  resolveHarnessManifest,
} from '../platform-harness/core/policy.ts'
import { createProductionHarnessRequest } from '../platform-harness/adapters/production.ts'
import { runHarnessWorker } from '../platform-harness/runtime/runner.ts'
import { normalizeHarnessVerification } from '../platform-harness/verification/outcome-verifier.ts'
import type {
  HarnessAuthorityEnvelope,
  HarnessManifest,
} from '../platform-harness/core/types.ts'
import type { GovernedHarnessExecutor } from '../platform-harness/runtime/governed-executor.ts'

function authority(deadlineMs: number): HarnessAuthorityEnvelope {
  return {
    manifestRef: 'host://deadline-test',
    verified: true,
    verifiedBy: 'host',
    environments: ['production'],
    capabilities: [{ id: 'native.read', environments: ['production'], mutating: false, risk: 'read' }],
    limits: { maxToolCalls: 2, maxConcurrency: 1, deadlineMs },
  }
}

function manifest(deadlineMs = 100): HarnessManifest {
  const decision = resolveHarnessManifest(createProductionHarnessRequest({
    runId: 'deadline-run',
    objective: 'prove one hard deadline',
    tenantId: 'tenant-test',
    portableId: 'portable-test',
    agentId: 'agent-test',
    role: 'worker',
    environmentId: 'prod-test',
    requestedCapabilities: ['native.read'],
    limits: { maxToolCalls: 2, maxConcurrency: 1, deadlineMs },
  }), authority(deadlineMs))
  assert.equal(decision.allowed, true)
  if (decision.allowed === false) throw new Error(decision.reasons.join(','))
  return decision.manifest
}

const capabilities = {
  async resolve(m: HarnessManifest) {
    return {
      satisfied: true,
      resolved: Object.fromEntries(m.capabilities.map(c => [c.id, { capabilityId: c.id } as any])),
      missing: [],
    }
  },
}

test('delegated child inherits the earlier parent absolute deadline', () => {
  const parentDeadline = new Date(Date.now() + 30_000).toISOString()
  const parentRequest = createProductionHarnessRequest({
    runId: 'parent',
    objective: 'parent',
    tenantId: 'tenant-test',
    portableId: 'portable-parent',
    agentId: 'parent-agent',
    role: 'parent',
    environmentId: 'prod-test',
    requestedCapabilities: ['native.read'],
    limits: { maxToolCalls: 2, maxConcurrency: 1, deadlineMs: 60_000 },
    deadlineAt: parentDeadline,
  })
  const parentDecision = resolveHarnessManifest(parentRequest, authority(60_000))
  assert.equal(parentDecision.allowed, true)
  if (parentDecision.allowed === false) return

  const childRequest = createProductionHarnessRequest({
    runId: 'child',
    objective: 'child',
    tenantId: 'tenant-test',
    portableId: 'portable-child',
    agentId: 'child-agent',
    role: 'child',
    environmentId: 'prod-test',
    requestedCapabilities: ['native.read'],
    limits: { maxToolCalls: 1, maxConcurrency: 1, deadlineMs: 60_000 },
    deadlineAt: new Date(Date.now() + 120_000).toISOString(),
    parent: {
      runId: parentDecision.manifest.runId,
      authorityManifestRef: parentDecision.manifest.authorityManifestRef,
    },
  })
  const childDecision = resolveChildHarnessManifest(childRequest, authority(60_000), parentDecision.manifest)
  assert.equal(childDecision.allowed, true)
  if (childDecision.allowed === false) return
  assert.equal(childDecision.manifest.deadlineAt, parentDecision.manifest.deadlineAt)
})

test('slow governed execution is aborted by the Harness wall-clock deadline', async () => {
  let hostSawAbort = false
  let verifierCalls = 0
  const executor: GovernedHarnessExecutor = {
    async execute(_manifest, action, control) {
      return await new Promise(resolve => {
        const timer = setTimeout(() => resolve({
          actionId: action.actionId,
          capabilityId: action.capabilityId,
          status: 'executed' as const,
          evidenceRefs: ['evidence://too-late'],
        }), 1_000)
        control?.signal?.addEventListener('abort', () => {
          hostSawAbort = true
          clearTimeout(timer)
          resolve({
            actionId: action.actionId,
            capabilityId: action.capabilityId,
            status: 'execution_failed' as const,
            error: 'aborted',
          })
        }, { once: true })
      })
    },
  }

  const result = await runHarnessWorker({
    manifest: manifest(80),
    capabilities,
    executor,
    worker: { async run(ctx) { await ctx.execute({ actionId: 'slow', kind: 'read', capabilityId: 'native.read' }) } },
    verifier: { async verify() { verifierCalls += 1; return { verified: true, verifierRef: 'verifier://late', evidenceRefs: ['evidence://late'] } } },
  })

  assert.equal(hostSawAbort, true)
  assert.equal(verifierCalls, 0)
  assert.equal(result.outcome.status, 'harness_failure')
  assert.equal(result.outcome.failureCode, 'harness_deadline_exceeded')
  assert.ok((result.usage?.elapsedMs ?? 10_000) < 750)
})

test('independent verification itself cannot outlive the Harness deadline', async () => {
  let verifierSawCompletion = false
  const result = await runHarnessWorker({
    manifest: manifest(80),
    capabilities,
    executor: { async execute(_manifest, action) { return { actionId: action.actionId, capabilityId: action.capabilityId, status: 'executed' } } },
    worker: { async run() {} },
    verifier: {
      async verify() {
        await new Promise(resolve => setTimeout(resolve, 1_000))
        verifierSawCompletion = true
        return { verified: true, verifierRef: 'verifier://too-late', evidenceRefs: ['evidence://too-late'] }
      },
    },
  })

  assert.equal(verifierSawCompletion, false)
  assert.equal(result.outcome.status, 'harness_failure')
  assert.equal(result.outcome.failureCode, 'harness_deadline_exceeded')
})

test('verified success without observable evidence is downgraded to Harness failure attribution', () => {
  const normalized = normalizeHarnessVerification({
    verified: true,
    verifierRef: 'verifier://assertion-only',
    evidenceRefs: [],
  })
  assert.equal(normalized.verified, false)
  assert.equal(normalized.failureAttribution, 'harness')
  assert.equal(normalized.reason, 'harness_verifier_evidence_required')
})
