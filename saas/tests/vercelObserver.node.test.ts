import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { VercelObserver, VercelObserverError, incidentSchema, sanitizeString } from '../lib/supervisor/index.ts'

const now = new Date('2026-07-16T12:00:00.000Z')
const dep = (o = {}) => ({ id: 'dpl_1', projectId: 'prj_1', state: 'READY', target: 'preview', createdAt: now.getTime() - 60_000, meta: {}, ...o })
function setup(deployments = [dep()], overrides = {}) {
  const calls = { list: 0, sleeps: [] }
  const cfg = { providerConnectionId: 'conn_1', projectId: 'prj_1', environment: 'preview', lookbackWindowMs: 86_400_000, maxDeployments: 10, repeatedFailureThreshold: 2, stuckDeploymentThresholdMs: 60 * 60 * 1000, maxAttempts: 3, clock: { now: () => now }, sleeper: { sleep: async (ms) => { calls.sleeps.push(ms) } }, ...overrides }
  const client = { getProjectMetadata: async () => ({ id: 'prj_1' }), getDeployment: async () => dep(), listRecentDeployments: async () => { calls.list += 1; return { deployments } } }
  return { observer: new VercelObserver({ config: cfg, secretResolver: async () => 'vercel_token_test_secret', client }), calls, cfg, client }
}
async function incidents(deployments, overrides = {}) { return (await setup(deployments, overrides).observer.observe({ provider: 'vercel', environment: overrides.environment || 'preview' })) }

test('healthy ready deployment produces no incident', async () => assert.deepEqual(await incidents([dep()]), []))
test('healthy project returns an empty incident array', async () => assert.equal((await incidents([dep({ state: 'READY' })])).length, 0))
test('failed sandbox deployment produces a warning', async () => { const out = await incidents([dep({ state: 'ERROR', target: 'sandbox', error: { message: 'failed' } })], { environment: 'sandbox' }); assert.equal(out[0].severity, 'warning') })
test('failed preview deployment produces a warning', async () => { const out = await incidents([dep({ state: 'FAILED', target: 'preview' })]); assert.equal(out[0].severity, 'warning') })
test('failed production deployment produces a critical incident', async () => { const out = await incidents([dep({ state: 'ERROR', target: 'production' })], { environment: 'production' }); assert.equal(out[0].severity, 'critical') })
test('consecutive failures produce a repeated-failure incident', async () => { const out = await incidents([dep({ id: 'a', state: 'ERROR' }), dep({ id: 'b', state: 'FAILED' })]); assert.equal(out.length, 1); assert.equal(out[0].metadata.incidentType, 'repeated_deployment_failure') })
test('repeated-failure threshold is configurable', async () => { const out = await incidents([dep({ id: 'a', state: 'ERROR' }), dep({ id: 'b', state: 'FAILED' }), dep({ id: 'c', state: 'ERROR' })], { repeatedFailureThreshold: 3 }); assert.equal(out[0].metadata.threshold, 3) })
test('stuck building deployment produces an incident', async () => { const out = await incidents([dep({ state: 'BUILDING', createdAt: now.getTime() - 7_200_000 })]); assert.equal(out[0].metadata.incidentType, 'stuck_deployment') })
test('a recent building deployment is not incorrectly classified as stuck', async () => assert.deepEqual(await incidents([dep({ state: 'BUILDING', createdAt: now.getTime() - 60_000 })]), []))
test('canceled production deployment produces a warning', async () => { const out = await incidents([dep({ state: 'CANCELED', target: 'production' })], { environment: 'production' }); assert.equal(out[0].severity, 'warning') })
test('unknown Vercel state produces a warning incident', async () => { const out = await incidents([dep({ state: 'MYSTERY' })]); assert.equal(out[0].metadata.incidentType, 'unknown_provider_state'); assert.equal(out[0].severity, 'warning') })
test('authentication failure creates a critical provider-connection incident', async () => { const s = setup([]); s.client.listRecentDeployments = async () => { s.calls.list += 1; throw new VercelObserverError('Authorization: Bearer secret', 'auth', 401) }; const out = await s.observer.observe({ provider: 'vercel', environment: 'preview' }); assert.equal(out[0].severity, 'critical'); assert.equal(s.calls.list, 1) })
test('rate limiting produces a provider-unavailable incident after bounded retries', async () => { const s = setup([]); s.client.listRecentDeployments = async () => { s.calls.list += 1; throw new VercelObserverError('rate limit', 'unavailable', 429, 1000) }; const out = await s.observer.observe({ provider: 'vercel', environment: 'preview' }); assert.equal(s.calls.list, 3); assert.equal(out[0].metadata.incidentType, 'provider_api_unavailable'); assert.deepEqual(s.calls.sleeps, [1000, 1000]) })
test('authentication failures are not retried', async () => { const s = setup([]); s.client.listRecentDeployments = async () => { s.calls.list += 1; throw new VercelObserverError('no', 'auth', 403) }; await s.observer.observe({ provider: 'vercel', environment: 'preview' }); assert.equal(s.calls.list, 1) })
test('equivalent observations produce stable deduplication keys', async () => { const a = await incidents([dep({ state: 'ERROR' })]); const b = await incidents([dep({ state: 'ERROR' })]); assert.equal(a[0].incidentId, b[0].incidentId); assert.equal(a[0].metadata.fingerprint, b[0].metadata.fingerprint) })
test('tokens are redacted from provider errors', () => assert.doesNotMatch(sanitizeString('Authorization: Bearer abc123 VERCEL_TOKEN=secret Cookie: a=b'), /abc123|secret|a=b/))
test('Authorization headers are never stored in incidents', async () => { const out = await incidents([dep({ state: 'ERROR', error: { message: 'Authorization: Bearer abc123' } })]); assert.doesNotMatch(JSON.stringify(out), /abc123|Authorization/i) })
test('Raw API responses are not stored in incidents', async () => { const out = await incidents([dep({ state: 'ERROR', error: { message: '{"token":"abc","logs":["raw"]}' } })]); assert.doesNotMatch(JSON.stringify(out), /raw API|"logs"/) })
test('Incident output passes the existing incident schema', async () => { for (const i of await incidents([dep({ state: 'ERROR' })])) assert.equal(incidentSchema.parse(i).provider, 'vercel') })
test('The Observer has no Thinker dependency', () => assert.doesNotMatch(readFileSync(new URL('../lib/supervisor/providers/vercel/vercel-observer.ts', import.meta.url), 'utf8'), /Thinker|proposeRepairPlan|LLM|OpenAI|Gemini/))
test('The Observer has no Executor dependency', () => assert.doesNotMatch(readFileSync(new URL('../lib/supervisor/providers/vercel/vercel-observer.ts', import.meta.url), 'utf8'), /Executor|execute\(/))
test('The Observer has no Browser Runtime dependency', () => assert.doesNotMatch(readFileSync(new URL('../lib/supervisor/providers/vercel/vercel-observer.ts', import.meta.url), 'utf8'), /BrowserRuntime|Playwright|Chromium|browser-runtime/))
test('No mutation methods exist on the Vercel client interface', () => assert.doesNotMatch(readFileSync(new URL('../lib/supervisor/providers/vercel/vercel-types.ts', import.meta.url), 'utf8'), /createDeployment|redeploy|cancelDeployment|updateProject|environment variable|delete|rotate|change domains/i))
test('Tests perform no real network requests', async () => { const original = globalThis.fetch; globalThis.fetch = async () => { throw new Error('network forbidden') }; try { assert.deepEqual(await incidents([dep()]), []) } finally { globalThis.fetch = original } })
