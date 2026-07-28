import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DeterministicVercelThinker, repairPlanSchema } from '../lib/supervisor/index.ts'
import type { SupervisorIncident } from '../lib/supervisor/index.ts'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


const incident = (metadata = {}, overrides = {}): SupervisorIncident => ({
  incidentId: 'INC-VCL-001',
  provider: 'vercel',
  environment: 'production',
  severity: 'critical',
  detectedAt: '2026-07-16T12:00:00.000Z',
  source: 'cron',
  errorMessage: 'Deployment failed.',
  affectedResource: 'dpl_failed_latest',
  evidence: [{ evidenceId: 'EV-1', type: 'deployment', capturedAt: '2026-07-16T12:00:00.000Z', summary: 'Vercel deployment state ERROR.' }],
  metadata: { incidentType: 'deployment_failed', deploymentId: 'dpl_failed_latest', projectId: 'prj_1', ...metadata },
  ...overrides,
})

function plan(metadata = {}, overrides = {}) {
  return repairPlanSchema.parse(new DeterministicVercelThinker().proposeRepairPlan(incident(metadata, overrides)))
}

test('deterministic Vercel Thinker plans read deployment events and logs before diagnosis', () => {
  const out = plan()
  assert.equal(out.requiresBrowser, false)
  assert.equal(out.steps.some(step => step.stepId === 'read-deployment-events' && step.action === 'read'), true)
  assert.equal(out.steps.every(step => step.protectedAction === false), true)
})

test('deployment failure plans inspect environment variable names without reading values', () => {
  const out = plan()
  const envStep = out.steps.find(step => step.stepId === 'read-project-env-names')
  assert.ok(envStep)
  assert.equal(envStep.parameters.namesOnly, true)
  assert.equal(Object.hasOwn(envStep.parameters, 'secretRef'), false)
  assert.equal(Object.hasOwn(envStep.parameters, 'value'), false)
})

test('repeated failures read every deployment id instead of the project id', () => {
  const out = plan(
    { incidentType: 'repeated_deployment_failure', deploymentIds: ['dpl_older', 'dpl_latest'] },
    { affectedResource: 'prj_1' },
  )
  const deploymentReads = out.steps.filter(step => step.stepId.startsWith('read-deployment-') && !step.stepId.startsWith('read-deployment-events'))
  assert.deepEqual(deploymentReads.map(step => step.parameters.deploymentId), ['dpl_older', 'dpl_latest'])
  assert.equal(deploymentReads.some(step => step.parameters.deploymentId === 'prj_1'), false)
})

test('repeated failure without deployment ids fails closed', () => {
  const out = plan({ incidentType: 'repeated_deployment_failure', deploymentId: undefined }, { affectedResource: 'prj_1' })
  assert.equal(out.steps[0].action, 'stop')
})

test('observer provider_connection_failure is treated as an auth incident', () => {
  const out = plan({ incidentType: 'provider_connection_failure', providerConnectionId: 'conn_1' })
  assert.equal(out.steps[0].stepId, 'read-connection-metadata')
  assert.equal(out.steps[0].parameters.connectionId, 'conn_1')
  assert.equal(out.riskLevel, 'medium')
})

test('canceled production deployment plans alias inspection', () => {
  const out = plan({ incidentType: 'canceled_production_deployment' })
  assert.equal(out.steps.some(step => step.stepId === 'read-production-aliases'), true)
})

test('unsupported Vercel cases fail closed with stop plan', () => {
  const out = plan({ incidentType: 'new_unhandled_case' })
  assert.equal(out.steps[0].action, 'stop')
  assert.equal(out.riskLevel, 'high')
})

test('Vercel Thinker has no Executor or Browser Runtime dependency', () => {
  const source = hydrateLocalizedSource(readFileSync(new URL('../lib/supervisor/providers/vercel/vercel-thinker.ts', import.meta.url), 'utf8'))
  assert.doesNotMatch(source, /Executor|execute\(|BrowserRuntime|Playwright|Chromium|browser-runtime/)
})
