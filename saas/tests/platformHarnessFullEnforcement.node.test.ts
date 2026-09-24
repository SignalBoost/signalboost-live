import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createProductionHarnessRequest,
  runHarnessWorker,
  runProductionHarnessEnvelope,
  type HarnessManifest,
} from '../platform-harness/index.ts'

function manifest(limits: HarnessManifest['limits'] = {}): HarnessManifest {
  return {
    runId: 'full-enforcement-test',
    objective: 'exercise the shared harness runtime',
    identity: {
      agentId: 'specialist-test',
      role: 'specialist',
      tenantId: 'tenant-test',
      portableId: 'specialist-test',
    },
    profile: 'sandbox',
    environment: {
      environmentId: 'sandbox-test',
      class: 'sandbox',
    },
    capabilities: [{
      id: 'native.test',
      environments: ['sandbox'],
      mutating: false,
      risk: 'read',
    }],
    authorityManifestRef: 'host://full-enforcement-test',
    limits,
    learningFeedbackAllowed: false,
  }
}

const capabilityResolver = {
  async resolve() {
    return {
      satisfied: true,
      resolved: { 'native.test': {} as any },
      missing: [],
    }
  },
}

const verifier = {
  async verify() {
    return {
      verified: true,
      verifierRef: 'verifier://full-enforcement-test',
      evidenceRefs: ['evidence://full-enforcement-test'],
    }
  },
}

test('Harness maxConcurrency is a runtime ceiling, not manifest-only metadata', async () => {
  let executions = 0
  const result = await runHarnessWorker({
    manifest: manifest({ maxConcurrency: 1 }),
    capabilities: capabilityResolver,
    executor: {
      async execute(_manifest, action) {
        executions += 1
        await Promise.resolve()
        return {
          actionId: action.actionId,
          capabilityId: action.capabilityId,
          status: 'executed' as const,
        }
      },
    },
    worker: {
      async run(context) {
        const first = context.execute({
          actionId: 'one',
          kind: 'read',
          capabilityId: 'native.test',
        })
        const second = context.execute({
          actionId: 'two',
          kind: 'read',
          capabilityId: 'native.test',
        })
        const [, secondResult] = await Promise.all([first, second])
        assert.equal(secondResult.status, 'execution_failed')
        assert.equal(secondResult.error, 'harness_concurrency_limit_exceeded')
      },
    },
    verifier,
  })

  assert.equal(executions, 1)
  assert.equal(result.outcome.status, 'harness_failure')
  assert.equal(result.outcome.failureCode, 'harness_concurrency_limit_exceeded')
})

test('Harness hard cost ceiling fails closed when no host cost budget exists', async () => {
  let executions = 0
  const result = await runHarnessWorker({
    manifest: manifest({ maxCostUsd: 0.1 }),
    capabilities: capabilityResolver,
    executor: {
      async execute(_manifest, action) {
        executions += 1
        return {
          actionId: action.actionId,
          capabilityId: action.capabilityId,
          status: 'executed' as const,
        }
      },
    },
    worker: {
      async run(context) {
        const action = await context.execute({
          actionId: 'paid-one',
          kind: 'read',
          capabilityId: 'native.test',
        })
        assert.equal(action.status, 'execution_failed')
        assert.equal(action.error, 'harness_cost_budget_required')
      },
    },
    verifier,
  })

  assert.equal(executions, 0)
  assert.equal(result.outcome.status, 'harness_failure')
  assert.equal(result.outcome.failureCode, 'harness_cost_budget_required')
})

test('Harness refuses a cost reservation that exceeds the remaining ceiling', async () => {
  let executions = 0
  const remaining: number[] = []
  const result = await runHarnessWorker({
    manifest: manifest({ maxCostUsd: 0.1, maxConcurrency: 1 }),
    capabilities: capabilityResolver,
    executor: {
      async execute(_manifest, action) {
        executions += 1
        return {
          actionId: action.actionId,
          capabilityId: action.capabilityId,
          status: 'executed' as const,
        }
      },
    },
    costBudget: {
      async reserve(input) {
        remaining.push(input.remainingCostUsd)
        return { allowed: true, reservedCostUsd: 0.06 }
      },
    },
    worker: {
      async run(context) {
        const first = await context.execute({
          actionId: 'paid-one',
          kind: 'read',
          capabilityId: 'native.test',
        })
        assert.equal(first.status, 'executed')

        const second = await context.execute({
          actionId: 'paid-two',
          kind: 'read',
          capabilityId: 'native.test',
        })
        assert.equal(second.status, 'execution_failed')
        assert.equal(second.error, 'harness_cost_budget_exceeded')
      },
    },
    verifier,
  })

  assert.equal(executions, 1)
  assert.deepEqual(remaining.map(value => Math.round(value * 100)), [10, 4])
  assert.equal(result.outcome.status, 'harness_failure')
  assert.equal(result.outcome.failureCode, 'harness_cost_budget_exceeded')
})

test('Production COS/specialist envelope resolves, executes, verifies, then persists evidence', async () => {
  const request = createProductionHarnessRequest({
    runId: 'production-envelope-test',
    objective: 'read a bounded production diagnostic',
    tenantId: 'tenant-test',
    portableId: 'cos',
    agentId: 'cos-production',
    role: 'chief_of_staff',
    environmentId: 'production-test',
    requestedCapabilities: ['native.production.read'],
    limits: { maxToolCalls: 2, maxConcurrency: 1 },
  })
  const evidence: any[] = []

  const completed = await runProductionHarnessEnvelope({
    request,
    authority: {
      manifestRef: 'referee://production-envelope-test',
      verified: true,
      verifiedBy: 'referee',
      environments: ['production'],
      capabilities: [{
        id: 'native.production.read',
        environments: ['production'],
        mutating: false,
        risk: 'read',
      }],
      limits: { maxToolCalls: 2, maxConcurrency: 1 },
    },
    capabilities: {
      async resolve() {
        return {
          satisfied: true,
          resolved: { 'native.production.read': {} as any },
          missing: [],
        }
      },
    },
    executor: {
      async execute(_manifest, action) {
        return {
          actionId: action.actionId,
          capabilityId: action.capabilityId,
          status: 'executed' as const,
        }
      },
    },
    worker: {
      async run(context) {
        await context.execute({
          actionId: 'read-production',
          kind: 'read',
          capabilityId: 'native.production.read',
        })
      },
    },
    verifier: {
      async verify() {
        return {
          verified: true,
          verifierRef: 'verifier://production-envelope-test',
          evidenceRefs: ['evidence://production-envelope-test'],
        }
      },
    },
    evidenceSink: {
      async append(record) {
        evidence.push(record)
      },
    },
  })

  assert.equal(completed.accepted, true)
  if (!completed.accepted) return
  assert.equal(completed.completed.route.destination, 'durable_evidence')
  assert.equal(completed.completed.evidence.profile, 'production')
  assert.equal(evidence.length, 1)
  assert.equal(evidence[0]?.runId, 'production-envelope-test')
})
