import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { InMemoryVercelHealthStore, VercelDeploymentHealthIntelligence } from '../lib/supervisor/index.ts'

const now = new Date('2026-07-17T00:00:00.000Z')
function deps(deployments) { const store = new InMemoryVercelHealthStore(); const calls = { deployment:0, events:0, env:0, alias:0 }; const client = { listRecentDeployments: async () => ({ deployments }), getProjectMetadata: async () => ({ id:'prj_1' }), getDeployment: async ({ deploymentId }) => { calls.deployment++; return { id: deploymentId, state:'ERROR', target:'production', createdAt: now.getTime() } }, getDeploymentEvents: async () => { calls.events++; return { events: [{ message:'failed without secrets' }] } }, listProjectEnvNames: async () => { calls.env++; return { names: ['NEXT_PUBLIC_SITE_URL','SUPABASE_URL'] } }, listProductionAliases: async () => { calls.alias++; return { aliases: ['saas.signalboostapp.com'] } } }; return { workflow: new VercelDeploymentHealthIntelligence({ config: { providerConnectionId:'conn', projectId:'prj_1', environment:'production', lookbackWindowMs:86400000, maxDeployments:10, repeatedFailureThreshold:2, stuckDeploymentThresholdMs:3600000, maxAttempts:1, clock:{ now: () => now }, sleeper:{ sleep: async () => {} } }, secretResolver: async () => 'token_secret', client, store }), store, calls } }

test('health workflow performs end-to-end read-only diagnosis and persists evidence', async () => { const s = deps([{ id:'dpl_1', state:'ERROR', target:'production', createdAt: now.getTime(), error:{ message:'build failed' } }]); const run = await s.workflow.run(); assert.equal(run.status, 'incident_detected'); assert.equal(run.verification.status, 'verified'); assert.equal(s.calls.deployment, 1); assert.equal(s.calls.events, 1); assert.equal(s.calls.env, 1); assert.equal(run.evidence.some(e => e.kind === 'project_env_names' && e.metadata.valuesRead === false), true); assert.equal((await s.store.listRuns()).length, 1) })

test('healthy observation is persisted with verified no-incident evidence', async () => { const s = deps([{ id:'dpl_ready', state:'READY', target:'production', createdAt: now.getTime() }]); const run = await s.workflow.run(); assert.equal(run.status, 'healthy'); assert.equal(run.incident, undefined); assert.equal(run.verification.status, 'verified'); assert.equal((await s.store.listRuns())[0].runId, run.runId) })

test('workflow stores no token or mutation capability', async () => { const source = readFileSync(new URL('../lib/supervisor/providers/vercel/health-intelligence.ts', import.meta.url), 'utf8'); assert.doesNotMatch(source, /redeploy|createDeployment|cancelDeployment|updateProject|delete|rotate|BrowserRuntime|Playwright|Chromium/); const s = deps([{ id:'dpl_1', state:'ERROR', target:'production', createdAt: now.getTime(), error:{ message:'Authorization: Bearer secret' } }]); const run = await s.workflow.run(); assert.doesNotMatch(JSON.stringify(run), /token_secret|Bearer secret/) })
import { InMemoryCoordinationStore } from '../lib/supervisor/coordination/index.ts'

async function governed(deployments, mutate) {
  const s = deps(deployments)
  const store = new InMemoryCoordinationStore({ now: () => now })
  await store.registerInstance({ instanceId:'owner-1', runtimeId:'runtime-1', startedAt:now.toISOString(), heartbeatAt:now.toISOString(), softwareVersion:'test', schemaVersion:'supervisor-instance-v1', supportedProviderKinds:['vercel'], status:'healthy' })
  await store.enqueueWorkItem({ workItemId:'work-1', workItemType:'vercel_deployment_health', incidentId:'inc-work', provider:'vercel', projectId:'prj_1', resourceId:'dpl_1', environment:'production', state:'queued', priority:1, createdAt:now.toISOString(), availableAt:now.toISOString(), attempt:0, maxAttempts:1, policyVersion:'ha-policy-v1', capabilityVersion:'vercel-browser-capabilities-v1', adapterVersion:'vercel-browser-adapter-v1', schemaVersion:'supervisor-work-item-v1' })
  const lease = await store.acquireLease({ workItemId:'work-1', ownerInstanceId:'owner-1', ownerRuntimeId:'runtime-1', leaseDurationMs:60_000, now })
  const ctx = { coordinationStore:store, workItemId:'work-1', ownerInstanceId:'owner-1', ownerRuntimeId:'runtime-1', leaseId:lease.leaseId, fencingToken:lease.fencingToken, executionMode:'api_only' }
  if (mutate) mutate(ctx, store)
  return s.workflow.run(ctx)
}

test('governed run validates durable lease, fence, BPAL metadata, exact scope, audit, and comparison status', async () => {
  const run = await governed([{ id:'dpl_1', state:'ERROR', target:'production', createdAt: now.getTime(), error:{ message:'build failed' } }])
  assert.equal(run.status, 'incident_detected')
  assert.equal(run.governance.workItemId, 'work-1')
  assert.equal(run.selectedChannel, 'api')
  assert.equal(run.comparisonStatus, 'comparison-pending')
  assert.equal(run.bpalSelections[0].capabilityId, 'compare_dashboard_with_api')
  assert.equal(run.bpalSelections[0].productionExecutionEnabled, false)
  assert.deepEqual(run.completedStepIds, run.approvedStepIds)
  for (const event of ['lease_validated','fence_validated','policy_evaluated','bpal_capability_resolved','inspection_scope_approved','verification_completed']) assert.equal(run.auditEvents.some(e => e.eventType === event), true)
})

test('governed run fails closed for missing lease, stale fence, mismatched owner, and duplicate approved scope', async () => {
  assert.equal((await governed([{ id:'dpl_1', state:'ERROR', target:'production', createdAt: now.getTime() }], ctx => { ctx.leaseId='missing' })).status, 'rejected')
  assert.equal((await governed([{ id:'dpl_1', state:'ERROR', target:'production', createdAt: now.getTime() }], ctx => { ctx.fencingToken=99 })).status, 'rejected')
  assert.equal((await governed([{ id:'dpl_1', state:'ERROR', target:'production', createdAt: now.getTime() }], ctx => { ctx.ownerInstanceId='other' })).status, 'rejected')
  const bad = await governed([{ id:'dpl_1', state:'ERROR', target:'production', createdAt: now.getTime() }], ctx => { ctx.approvedStepIds=['read-deployment','read-deployment'] })
  assert.equal(bad.status, 'read_failed')
  assert.match(bad.evidence[0].summary, /duplicate_approved_step/)
})

test('operator page has no mutation controls and localization is complete for Vercel health labels', () => {
  const page = readFileSync(new URL('../app/dashboard/supervisor/vercel-health/page.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(page, /Redeploy|Cancel deployment|Edit environment variable|Retry mutation|Approve production browser|<button/i)
  for (const lang of ['en','es','pt','pl','ru']) {
    const json = JSON.parse(readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8'))
    assert.ok(json.vercelHealth.productionBrowserDisabled)
    assert.ok(json.vercelHealth.providerMutationDisabled)
    assert.ok(json.vercelHealth.labels.auditTimeline)
  }
})
