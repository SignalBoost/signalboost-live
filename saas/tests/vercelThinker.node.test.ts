import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { VercelThinker, repairPlanSchema } from '../lib/supervisor/index.ts'

const now = new Date('2026-07-16T13:00:00.000Z')
const thinker = new VercelThinker({ clock: { now: () => now } })
const incident = (metadata = {}, overrides = {}) => ({
  incidentId: 'INC-VERCEL-001', provider: 'vercel', environment: 'preview', severity: 'warning', detectedAt: '2026-07-16T12:00:00.000Z', source: 'api', errorCode: 'VERCEL_FAILED', errorMessage: 'Vercel deployment failed.', affectedResource: 'dpl_1',
  evidence: [{ evidenceId: 'EV-1', type: 'provider_observation', capturedAt: '2026-07-16T12:00:00.000Z', summary: 'Observed from Vercel API.', reference: 'dpl_1' }],
  metadata: { incidentType: 'failed_deployment', projectId: 'prj_1', providerConnectionId: 'conn_1', deploymentId: 'dpl_1', ...metadata }, ...overrides,
})
const planFor = (i) => repairPlanSchema.parse(thinker.proposeRepairPlan(i))
const step = (plan, id) => plan.steps.find(s => s.stepId === id)

test('failed deployment produces a valid repair plan', () => assert.equal(planFor(incident()).targetProvider, 'vercel'))
test('failed deployment plan preserves incident id', () => assert.equal(planFor(incident()).incidentId, 'INC-VERCEL-001'))
test('failed deployment plan uses deterministic generatedAt clock', () => assert.equal(planFor(incident()).generatedAt, now.toISOString()))
test('failed deployment diagnostics keep requiresBrowser false', () => assert.equal(planFor(incident()).requiresBrowser, false))
test('failed deployment plan reads deployment through API', () => assert.equal(step(planFor(incident()), 'read-deployment').action, 'api_request'))
test('failed deployment plan reads build diagnostics through API', () => assert.equal(step(planFor(incident()), 'read-build-diagnostics').action, 'api_request'))
test('failed deployment plan stages owner-gated repair proposal', () => assert.equal(step(planFor(incident()), 'stage-deployment-repair-pr').protectedAction, true))
test('missing env evidence stages env var PR instead of direct save', () => assert.equal(step(planFor(incident({ sanitizedErrorMessage: 'Missing environment variable NEXT_PUBLIC_URL' })), 'stage-env-var-pr').action, 'request_approval'))
test('missing env diagnostics remain API-capable without browser', () => assert.equal(planFor(incident({ sanitizedErrorMessage: 'Environment variable not found' })).requiresBrowser, false))
test('production failed deployment is high risk', () => assert.equal(planFor(incident({}, { environment: 'production', severity: 'critical' })).riskLevel, 'high'))
test('preview failed deployment is medium risk', () => assert.equal(planFor(incident()).riskLevel, 'medium'))
test('failed deployment includes successor-ready verification', () => assert.equal(planFor(incident()).verificationSteps[0].stepId, 'verify-successor-ready'))
test('failed deployment includes owner-gated rollback proposal', () => assert.equal(planFor(incident()).rollbackSteps[0].protectedAction, true))
test('provider connection failure proposes masked connection diagnostics', () => assert.equal(step(planFor(incident({ incidentType: 'provider_connection_failure' })), 'read-provider-connection').action, 'read'))
test('provider connection failure uses secretRef only', () => assert.equal(step(planFor(incident({ incidentType: 'provider_connection_failure' })), 'read-project-metadata').parameters.secretRef, 'provider-connection:conn_1'))
test('provider connection failure requires approval before credential repair', () => assert.equal(step(planFor(incident({ incidentType: 'provider_connection_failure' })), 'stage-credential-repair').protectedAction, true))
test('provider api unavailable reads public Vercel status', () => assert.equal(step(planFor(incident({ incidentType: 'provider_api_unavailable' })), 'read-vercel-status').parameters.endpoint, 'https://www.vercel-status.com/api/v2/status.json'))
test('provider api unavailable is low risk', () => assert.equal(planFor(incident({ incidentType: 'provider_api_unavailable' })).riskLevel, 'low'))
test('repeated failure reads the failed sequence', () => assert.equal(step(planFor(incident({ incidentType: 'repeated_deployment_failure', deploymentIds: ['a', 'b'] })), 'read-failure-sequence').action, 'read'))
test('production repeated failure is high risk', () => assert.equal(planFor(incident({ incidentType: 'repeated_deployment_failure' }, { environment: 'production', severity: 'critical' })).riskLevel, 'high'))
test('stuck deployment verifies no active stuck deployment remains', () => assert.equal(planFor(incident({ incidentType: 'stuck_deployment', thresholdMs: 3600000 })).verificationSteps[0].stepId, 'verify-no-stuck-active-deployment'))
test('stuck deployment stages owner-gated action', () => assert.equal(step(planFor(incident({ incidentType: 'stuck_deployment' })), 'stage-stuck-deployment-action').protectedAction, true))
test('canceled production deployment is high risk', () => assert.equal(planFor(incident({ incidentType: 'canceled_production_deployment' }, { environment: 'production' })).riskLevel, 'high'))
test('canceled production deployment does not redeploy directly', () => assert.equal(step(planFor(incident({ incidentType: 'canceled_production_deployment' }, { environment: 'production' })), 'stage-production-redeploy').action, 'request_approval'))
test('unknown Vercel incident fails closed to owner triage', () => assert.equal(step(planFor(incident({ incidentType: 'unknown_provider_state' })), 'request-owner-triage').protectedAction, true))
test('VercelThinker has no Executor or Browser Runtime dependency', () => { const source = readFileSync(new URL('../lib/supervisor/providers/vercel/thinker/vercel-thinker.ts', import.meta.url), 'utf8') + readFileSync(new URL('../lib/supervisor/providers/vercel/thinker/rules.ts', import.meta.url), 'utf8'); assert.doesNotMatch(source, /Executor|execute\(|BrowserRuntime|Playwright|Chromium|browser-runtime/) })
