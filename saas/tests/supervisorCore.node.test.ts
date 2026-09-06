import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DefaultSupervisorPolicyEngine, SupervisorOrchestrator, incidentSchema, repairPlanSchema } from '../lib/supervisor/index.ts'
import type { AuditEvent, ExecutionResult, PolicyDecision, Verifier } from '../lib/supervisor/index.ts'
import { createReferenceVerifier } from '../lib/supervisor/portable/reference-verifier.ts'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


const incident = () => ({
  incidentId: 'INC-001', provider: 'vercel', environment: 'sandbox', severity: 'warning', detectedAt: '2026-07-16T00:00:00.000Z', source: 'api', errorMessage: 'Deployment failed.',
  evidence: [{ evidenceId: 'EV-001', type: 'log', capturedAt: '2026-07-16T00:00:01.000Z', summary: 'Build log captured.' }], metadata: { retryCount: 1 },
})
const step = (overrides = {}) => ({ stepId: 'read-1', action: 'read', description: 'Read status.', protectedAction: false, parameters: { resource: 'deployment' }, ...overrides })
const plan = (overrides = {}) => ({
  planId: 'PLAN-001', incidentId: 'INC-001', diagnosis: 'Missing non-secret setting.', confidenceScore: 80, requiresBrowser: false, riskLevel: 'low', targetProvider: 'vercel', targetEnvironment: 'sandbox',
  steps: [step()], verificationSteps: [step({ stepId: 'verify-1', action: 'verify', description: 'Verify status.' })], generatedAt: '2026-07-16T00:01:00.000Z', schemaVersion: 'supervisor-plan-v1', ...overrides,
})

const parsedIncident = () => incidentSchema.parse(incident())
const parsedPlan = (overrides = {}) => repairPlanSchema.parse(plan(overrides))
const completedExecution = (): ExecutionResult => ({ status: 'completed', executedStepIds: ['read-1'], startedAt: '2026-07-16T00:02:00.000Z', finishedAt: '2026-07-16T00:03:00.000Z', summary: 'done' })

test('invalid incidents are rejected', () => assert.throws(() => incidentSchema.parse({ ...incident(), environment: 'prod' }), /environment/))
test('non-serializable metadata is rejected', () => assert.throws(() => incidentSchema.parse({ ...incident(), metadata: { when: new Date() } }), /serializable/))
test('invalid repair plans are rejected', () => assert.throws(() => repairPlanSchema.parse({ ...plan(), confidenceScore: 101 }), /confidenceScore/))
test('plaintext secrets in step parameters are rejected', () => assert.throws(() => repairPlanSchema.parse(plan({ steps: [step({ parameters: { apiKey: 'plain' } })] })), /secret reference|plaintext/))
test('secretRef is accepted', () => assert.equal(repairPlanSchema.parse(plan({ steps: [step({ parameters: { secretRef: 'vercel/sandbox/test-variable' } })] })).steps[0].parameters.secretRef, 'vercel/sandbox/test-variable'))
test('requiresBrowser without targetOrigin is rejected', () => assert.throws(() => repairPlanSchema.parse(plan({ requiresBrowser: true })), /targetOrigin/))

test('disabled mode blocks every plan', () => {
  const decision = new DefaultSupervisorPolicyEngine().evaluate({ incident: parsedIncident(), plan: parsedPlan(), mode: 'disabled', context: {} })
  assert.equal(decision.outcome, 'blocked')
})
test('passive mode requires approval for protected actions', () => {
  const decision = new DefaultSupervisorPolicyEngine().evaluate({ incident: parsedIncident(), plan: parsedPlan({ steps: [step({ protectedAction: true, action: 'click' })] }), mode: 'passive', context: {} })
  assert.equal(decision.outcome, 'approval_required')
})
test('autopilot approves low-risk reversible routine actions', () => {
  const engine = new DefaultSupervisorPolicyEngine()
  const approved = engine.evaluate({ incident: parsedIncident(), plan: parsedPlan({ steps: [step({ stepId: 'fill-1', action: 'fill', parameters: { reversible: true } })] }), mode: 'autopilot', context: {} })
  assert.equal(approved.outcome, 'approved')
  assert.deepEqual(approved.approvedStepIds, ['fill-1'])
  const ambiguous = engine.evaluate({ incident: parsedIncident(), plan: parsedPlan({ steps: [step({ stepId: 'fill-1', action: 'fill' })] }), mode: 'autopilot', context: {} })
  assert.equal(ambiguous.outcome, 'approval_required')
})
test('routine reversible production repairs are automatically approved', () => {
  const decision = new DefaultSupervisorPolicyEngine().evaluate({ incident: parsedIncident(), plan: parsedPlan({ targetEnvironment: 'production', steps: [step({ action: 'api_request', parameters: { operation: 'restart_worker', reversible: true } })] }), mode: 'autopilot', context: {} })
  assert.equal(decision.outcome, 'approved')
  assert.deepEqual(decision.approvedStepIds, ['read-1'])
})
test('financial production changes still require approval even when marked reversible', () => {
  const decision = new DefaultSupervisorPolicyEngine().evaluate({ incident: parsedIncident(), plan: parsedPlan({ targetEnvironment: 'production', steps: [step({ action: 'api_request', description: 'Update billing limit.', parameters: { reversible: true } })] }), mode: 'autopilot', context: {} })
  assert.equal(decision.outcome, 'approval_required')
})
test('medium and high-risk repairs still require approval', () => {
  const engine = new DefaultSupervisorPolicyEngine()
  for (const riskLevel of ['medium', 'high'] as const) {
    const result = engine.evaluate({ incident: parsedIncident(), plan: parsedPlan({ riskLevel, steps: [step({ action: 'api_request', parameters: { reversible: true } })] }), mode: 'autopilot', context: {} })
    assert.equal(result.outcome, 'approval_required')
  }
})
test('critical-risk plans are blocked', () => {
  const decision = new DefaultSupervisorPolicyEngine().evaluate({ incident: parsedIncident(), plan: parsedPlan({ riskLevel: 'critical' }), mode: 'autopilot', context: {} })
  assert.equal(decision.outcome, 'blocked')
})

function deps(overrides: Partial<ConstructorParameters<typeof SupervisorOrchestrator>[0]> = {}) {
  const events: AuditEvent[] = []
  let executeCalls = 0
  const execution: ExecutionResult = completedExecution()
  return {
    events,
    get executeCalls() { return executeCalls },
    config: {
      thinker: { proposeRepairPlan: async () => plan() },
      policyEngine: { evaluate: async (): Promise<PolicyDecision> => ({ outcome: 'approved', reason: 'test', evaluatedAt: '2026-07-16T00:02:00.000Z', policyVersion: 'test', approvedStepIds: ['read-1'] }) },
      executor: { execute: async ({ approvedStepIds }: { approvedStepIds: string[] }) => { executeCalls += 1; return { ...execution, executedStepIds: approvedStepIds } } },
      verifier: { verify: async () => ({ status: 'verified', verifiedAt: '2026-07-16T00:04:00.000Z', summary: 'ok', errors: [] }) } as Verifier,
      audit: { write: async (event: AuditEvent) => { events.push(event) } },
      mode: 'autopilot' as const,
      executionContext: { executionId: 'EXEC-001' },
      ...overrides,
    },
  }
}

test('orchestrator never calls the Executor after invalid Thinker output', async () => {
  const d = deps({ thinker: { proposeRepairPlan: async () => ({ invalid: true }) } })
  const result = await new SupervisorOrchestrator(d.config).run(incident())
  assert.equal(result.status, 'failed')
  assert.equal(d.executeCalls, 0)
})
test('orchestrator never calls the Executor when approval is required', async () => {
  const d = deps({ policyEngine: { evaluate: async () => ({ outcome: 'approval_required', reason: 'needs owner', evaluatedAt: 'now', policyVersion: 'test', approvedStepIds: [] }) } })
  const result = await new SupervisorOrchestrator(d.config).run(incident())
  assert.equal(result.status, 'approval_required')
  assert.equal(d.executeCalls, 0)
})
test('orchestrator passes only approved step IDs to the Executor', async () => {
  let seen: string[] = []
  const d = deps({ executor: { execute: async ({ approvedStepIds }: { approvedStepIds: string[] }) => { seen = approvedStepIds; return { status: 'completed', executedStepIds: approvedStepIds, startedAt: 'a', finishedAt: 'b', summary: 'ok' } } } })
  const result = await new SupervisorOrchestrator(d.config).run(incident())
  assert.equal(result.status, 'completed')
  assert.deepEqual(seen, ['read-1'])
})
test('unknown approved step IDs fail closed', async () => {
  const d = deps({ policyEngine: { evaluate: async () => ({ outcome: 'approved', reason: 'bad', evaluatedAt: 'now', policyVersion: 'test', approvedStepIds: ['unknown'] }) } })
  const result = await new SupervisorOrchestrator(d.config).run(incident())
  assert.equal(result.status, 'failed')
  assert.equal(d.executeCalls, 0)
})
test('verification failure does not produce a successful repair result', async () => {
  const d = deps({ verifier: { verify: async () => ({ status: 'failed', verifiedAt: 'now', summary: 'not fixed', errors: ['still failing'] }) } as Verifier })
  const result = await new SupervisorOrchestrator(d.config).run(incident())
  assert.equal(result.status, 'unresolved')
})
test('audit failure before execution prevents execution', async () => {
  const d = deps({ audit: { write: async () => { throw new Error('audit unavailable') } } })
  const result = await new SupervisorOrchestrator(d.config).run(incident())
  assert.equal(result.status, 'failed')
  assert.equal(d.executeCalls, 0)
})
test('Thinker contract has no Executor or Browser Runtime dependency', () => {
  const source = hydrateLocalizedSource(readFileSync(new URL('../lib/supervisor/execution-contracts.ts', import.meta.url), 'utf8'))
  assert.match(source, /interface Thinker \{\s*proposeRepairPlan\(incident: SupervisorIncident\)/)
  assert.doesNotMatch(source.match(/interface Thinker \{[\s\S]*?\n\}/)?.[0] || '', /Executor|BrowserRuntime|BrowserSession|BrowserTask/)
})
test('Observer contract has no Executor or Browser Runtime dependency', () => {
  const source = hydrateLocalizedSource(readFileSync(new URL('../lib/supervisor/execution-contracts.ts', import.meta.url), 'utf8'))
  assert.match(source, /interface Observer \{\s*observe\(context: ProviderObservationContext\)/)
  assert.doesNotMatch(source.match(/interface Observer \{[\s\S]*?\n\}/)?.[0] || '', /Executor|BrowserRuntime|BrowserSession|BrowserTask/)
})

test('reference verifier runs every read-only verification step and reports verified', async () => {
  const seen: string[] = []
  const verifier = createReferenceVerifier({
    now: () => new Date('2026-07-16T00:04:00.000Z'),
    runner: async (verificationStep) => {
      seen.push(verificationStep.stepId)
      return { ok: true, summary: `${verificationStep.stepId} healthy`, data: { state: 'healthy' } }
    },
  })
  const result = await verifier.verify({
    incident: parsedIncident(),
    plan: parsedPlan({ verificationSteps: [step({ stepId: 'verify-1', action: 'verify' }), step({ stepId: 'read-2', action: 'read' })] }),
    execution: completedExecution(),
  })
  assert.equal(result.status, 'verified')
  assert.deepEqual(seen, ['verify-1', 'read-2'])
  assert.equal(result.metadata?.stepsTotal, 2)
  assert.equal(result.metadata?.stepsPassed, 2)
  assert.equal(result.metadata?.stepsUncheckable, 0)
})

test('reference verifier refuses mutation-shaped verification without calling the runner', async () => {
  let calls = 0
  const verifier = createReferenceVerifier({ runner: async () => { calls += 1; return { ok: true, summary: 'unexpected' } } })
  const result = await verifier.verify({
    incident: parsedIncident(),
    plan: parsedPlan({ verificationSteps: [step({ stepId: 'mutate-verify', action: 'api_request' })] }),
    execution: completedExecution(),
  })
  assert.equal(result.status, 'unresolved')
  assert.equal(calls, 0)
  assert.match(result.errors[0], /step_not_read_only/)
})

test('reference verifier permits protected read-only verification because it cannot mutate', async () => {
  const verifier = createReferenceVerifier({ runner: async (verificationStep) => ({ ok: true, summary: `${verificationStep.stepId} healthy` }) })
  const result = await verifier.verify({
    incident: parsedIncident(),
    plan: parsedPlan({ verificationSteps: [step({ stepId: 'protected-verify', action: 'verify', protectedAction: true })] }),
    execution: completedExecution(),
  })
  assert.equal(result.status, 'verified')
  assert.equal(result.metadata?.stepsPassed, 1)
})

test('reference verifier records failed observations and evaluates the full read-only plan', async () => {
  const seen: string[] = []
  const verifier = createReferenceVerifier({ runner: async (verificationStep) => {
    seen.push(verificationStep.stepId)
    return { ok: verificationStep.stepId !== 'verify-1', summary: verificationStep.stepId === 'verify-1' ? 'still unhealthy' : 'healthy' }
  } })
  const result = await verifier.verify({
    incident: parsedIncident(),
    plan: parsedPlan({ verificationSteps: [step({ stepId: 'verify-1', action: 'verify' }), step({ stepId: 'read-2', action: 'read' })] }),
    execution: completedExecution(),
  })
  assert.equal(result.status, 'failed')
  assert.deepEqual(seen, ['verify-1', 'read-2'])
  assert.match(result.errors[0], /check_failed:verify-1/)
  assert.equal(result.metadata?.stepsTotal, 2)
  assert.equal(result.metadata?.stepsPassed, 1)
  assert.equal(result.metadata?.stepsUncheckable, 0)
})

test('reference verifier does not verify incomplete execution', async () => {
  let calls = 0
  const verifier = createReferenceVerifier({ runner: async () => { calls += 1; return { ok: true, summary: 'healthy' } } })
  const result = await verifier.verify({
    incident: parsedIncident(),
    plan: parsedPlan(),
    execution: { ...completedExecution(), status: 'partial' },
  })
  assert.equal(result.status, 'unresolved')
  assert.equal(calls, 0)
})
