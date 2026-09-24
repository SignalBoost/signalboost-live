// saas/tests/platformHarnessEverywhere.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { currentHarnessExecutionContext } from '../platform-harness/runtime/execution-context.ts'
import { withEvaluationRuntimeHarness } from '../platform-harness/adapters/evaluation-runtime.ts'
import { withProductionRuntimeHarness } from '../platform-harness/adapters/production.ts'

const source = (path:string) => readFileSync(new URL(path, import.meta.url), 'utf8')

const evaluationInput = {
  runId: 'harness-everywhere-evaluation',
  objective: 'exercise exact evaluation runtime ingress',
  tenantId: 'itmounts',
  portableId: 'cos-university',
  agentId: 'candidate-agent',
  artifactId: 'artifact-1',
  artifactHash: 'a'.repeat(64),
  artifactRevision: 'b'.repeat(64),
  environmentId: 'evaluation-sandbox',
  fixtureHash: 'c'.repeat(64),
  limits: { deadlineMs: 30_000, maxToolCalls: 0, maxConcurrency: 1 },
} as const

test('live evaluation ingress binds exact identity and leaves no ambient context behind', async () => {
  assert.equal(currentHarnessExecutionContext(), null)
  await withEvaluationRuntimeHarness(evaluationInput, async () => {
    const current = currentHarnessExecutionContext()
    assert.ok(current)
    assert.equal(current.manifest.profile, 'evaluation_runtime')
    assert.equal(current.manifest.environment.class, 'sandbox')
    assert.equal(current.manifest.identity.agentId, evaluationInput.agentId)
    assert.equal(current.manifest.identity.artifact?.artifactId, evaluationInput.artifactId)
    assert.equal(current.manifest.identity.artifact?.artifactHash, evaluationInput.artifactHash)
    assert.equal(current.manifest.identity.artifact?.revision, evaluationInput.artifactRevision)
    assert.equal(current.manifest.environment.fixtureHash, evaluationInput.fixtureHash)
    assert.deepEqual(current.manifest.capabilities, [])
  })
  assert.equal(currentHarnessExecutionContext(), null)
})

test('nested evaluation cannot switch artifact or fixture identity', async () => {
  await withEvaluationRuntimeHarness(evaluationInput, async () => {
    await assert.rejects(
      withEvaluationRuntimeHarness({
        ...evaluationInput,
        artifactHash: 'd'.repeat(64),
      }, async () => undefined),
      /evaluation_runtime_harness_identity_conflict/,
    )
  })
})

test('generic Production workload ingress binds platform AI work without minting authority', async () => {
  await withProductionRuntimeHarness({
    runId: 'harness-everywhere-production',
    objective: 'exercise production workload ingress',
    tenantId: 'itmounts',
    portableId: 'cos',
    agentId: 'cos-platform-ai',
    role: 'platform_ai',
    environmentId: 'itmounts-production',
    limits: { deadlineMs: 30_000, maxToolCalls: 0, maxConcurrency: 1 },
  }, async () => {
    const current = currentHarnessExecutionContext()
    assert.ok(current)
    assert.equal(current.manifest.profile, 'production')
    assert.equal(current.manifest.environment.class, 'production')
    assert.equal(current.manifest.identity.agentId, 'cos-platform-ai')
    assert.deepEqual(current.manifest.capabilities, [])
  })
})

test('live University evaluator and academic model leaves all invoke the evaluation Harness ingress', () => {
  const paths = [
    '../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts',
    '../lib/ai/cos/cosUniversityDistilledArtifactEvaluation.ts',
    '../lib/ai/cos/cosUniversityPracticeExecution.ts',
    '../lib/ai/cos/cosUniversityAgentExamRuntime.ts',
    '../lib/ai/cos/cosUniversityAgentCapstoneRuntime.ts',
  ]
  for (const path of paths) {
    const value = source(path)
    assert.match(value, /withEvaluationRuntimeHarness\s*\(/, `${path} must enter evaluation_runtime`)
  }
})

test('shared AI ports and Audit have mandatory Production Harness ingress', () => {
  const aiPort = source('../lib/cos/aiPort.ts')
  const auditModel = source('../lib/audit/modelRouter.ts')
  const auditRoute = source('../app/api/hub/operator/audit/route.ts')
  assert.match(aiPort, /withProductionRuntimeHarness\s*\(/)
  assert.match(auditModel, /withProductionRuntimeHarness\s*\(/)
  assert.match(auditRoute, /withProductionRuntimeHarness\s*\(/)
})

test('existing COS, A2A specialist, Residency and Self-Healing entrypoints stay on governed Harness paths', () => {
  const cos = source('../app/api/cos-primary/route.ts')
  const specialist = source('../app/api/cos-specialist/route.ts')
  const residency = source('../app/api/cron/cos-university-residency/route.ts')
  const selfHealing = source('../self-healing-host/builder-residency-runtime-recovery.ts')

  assert.match(cos, /requireCosHarnessIngress\s*\(/)
  assert.match(cos, /withCosHarnessIngress\s*\(/)
  assert.match(specialist, /runCosA2ASpecialistProductionHarness\s*\(/)
  assert.match(specialist, /requireCosA2ASpecialistHarnessIngress\s*\(/)
  assert.match(residency, /runBuilderResidencyOrchestrator\s*\(/)
  assert.match(residency, /createSupervisorAuditHarnessEvidenceSink/)
  assert.match(selfHealing, /dispatchRepairPlan\s*\(/)
  assert.match(selfHealing, /SELF_HEALING_GATEWAY_POLICY/)
})

test('local inference continues to inherit Harness deadline and cancellation', () => {
  const inference = source('../lib/ai/local-inference.ts')
  assert.match(inference, /currentHarnessExecutionContext\s*\(/)
  assert.match(inference, /harnessDeadlineRemainingMs\s*\(/)
  assert.match(inference, /harnessContext\?\.signal\.addEventListener\('abort'/)
})
