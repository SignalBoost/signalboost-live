// saas/tests/platformHarnessUniversalIngress.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  currentHarnessExecutionContext,
  withHarnessExecutionContext,
} from '../platform-harness/runtime/execution-context.ts'
import { withHostProductionHarnessIngress } from '../platform-harness/runtime/host-ingress.ts'
import type { HarnessManifest } from '../platform-harness/core/types.ts'

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('host ingress binds a bounded Production HarnessRun when no run exists', async () => {
  let observedRunId = ''
  let observedCapability = ''
  await withHostProductionHarnessIngress({
    objective: 'test worker ingress',
    portableId: 'test-worker',
    agentId: 'test-worker',
    role: 'specialist',
    capabilityId: 'test.worker.execute',
    risk: 'write',
    deadlineMs: 20_000,
    maxConcurrency: 1,
    maxToolCalls: 2,
    runId: 'host-ingress-test',
  }, async () => {
    const context = currentHarnessExecutionContext()
    assert.ok(context)
    observedRunId = context!.manifest.runId
    observedCapability = context!.manifest.capabilities[0]?.id || ''
    assert.equal(context!.manifest.profile, 'production')
    assert.equal(context!.manifest.environment.class, 'production')
    assert.equal(context!.manifest.limits.maxConcurrency, 1)
    assert.equal(context!.manifest.limits.maxToolCalls, 2)
  })
  assert.equal(observedRunId, 'host-ingress-test')
  assert.equal(observedCapability, 'test.worker.execute')
  assert.equal(currentHarnessExecutionContext(), null)
})

test('host ingress never widens or replaces an existing HarnessRun', async () => {
  const parent: HarnessManifest = {
    runId: 'existing-run',
    objective: 'existing bounded work',
    identity: { agentId: 'existing', role: 'specialist', tenantId: 'itmounts', portableId: 'existing' },
    profile: 'production',
    environment: { environmentId: 'itmounts-production', class: 'production' },
    capabilities: [],
    authorityManifestRef: 'host://existing',
    limits: { deadlineMs: 10_000, maxConcurrency: 1 },
    deadlineAt: new Date(Date.now() + 10_000).toISOString(),
    learningFeedbackAllowed: false,
  }
  const controller = new AbortController()
  await withHarnessExecutionContext(parent, controller.signal, async () => {
    await withHostProductionHarnessIngress({
      objective: 'must reuse existing run',
      portableId: 'child-attempt',
      agentId: 'child-attempt',
      role: 'specialist',
      capabilityId: 'forbidden.widening',
      risk: 'consequential',
      deadlineMs: 300_000,
    }, async () => {
      assert.equal(currentHarnessExecutionContext()?.manifest.runId, 'existing-run')
      assert.deepEqual(currentHarnessExecutionContext()?.manifest.capabilities, [])
    })
  })
})

test('critical worker families have mandatory host ingress', () => {
  const builder = source('lib/builder/job-runner.ts')
  const distillation = source('lib/ai/cos/cosUniversityMassDistillationWorkflow.ts')
  const evaluation = source('lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts')
  const healing = source('agent-gateway-host/supervisor-repair.ts')

  assert.match(builder, /withHostProductionHarnessIngress/)
  assert.match(builder, /builder\.job\.execute/)
  assert.match(distillation, /withHostProductionHarnessIngress/)
  assert.match(distillation, /university\.distillation\.execute/)
  assert.match(evaluation, /withHostProductionHarnessIngress/)
  assert.match(evaluation, /university\.evaluation\.execute/)
  assert.match(healing, /withHostProductionHarnessIngress/)
  assert.match(healing, /self_healing\.repair\.dispatch/)
})
