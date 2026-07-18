import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { BUILT_IN_UNIVERSAL_PROVIDERS, createUniversalProviderRegistry, universalProviderRegistry, GitHubReadOnlyAdapter, GitHubProvider, UniversalProviderRegistry, redactProviderConnection, InMemoryProviderConnectionStore, createGitHubScheduleWork, ingestGitHubWebhook, InMemoryWebhookDeliveryStore, runGitHubObservationWork, type GitHubConnection } from '../lib/provider-framework/index.ts'
import { InMemoryCoordinationStore, ownershipIdentity } from '../lib/supervisor/coordination/index.ts'

function response(body: unknown, status=200, headers: Record<string,string>={}) { return new Response(JSON.stringify(body), { status, headers: { 'x-ratelimit-limit':'5000', 'x-ratelimit-remaining':'4999', 'x-ratelimit-reset':'1893456000', ...headers } }) }
function adapter(routes: Record<string, Response>) { return new GitHubReadOnlyAdapter(async (url) => { const path = new URL(url).pathname + new URL(url).search; const r = routes[path] ?? routes[new URL(url).pathname]; if (!r) return response({message:'missing'},404); return r.clone() }) }
const config = { organizationId:'org_1', token:'ghp_secret' }

test('registers GitHub provider through canonical registry and rejects duplicate capability across providers', () => {
  const registry = new UniversalProviderRegistry(); registry.register(GitHubProvider)
  assert.equal(registry.get('github').metadata.providerId, 'github')
  assert.equal(registry.getByCapability('github.repositories.list').metadata.providerId, 'github')
  assert.ok(Object.isFrozen(registry.get('github').metadata))
  assert.throws(() => registry.register(GitHubProvider), /duplicate_provider/)
  const duplicate = { ...GitHubProvider, metadata: { ...GitHubProvider.metadata, providerId:'github-copy' } }
  assert.throws(() => registry.register(duplicate), /duplicate_capability/)
})

test('canonical bootstrap makes built-in GitHub capabilities discoverable without manual registration', () => {
  assert.deepEqual(BUILT_IN_UNIVERSAL_PROVIDERS.map(provider => provider.metadata.providerId), ['github'])
  assert.equal(universalProviderRegistry.get('github').metadata.providerId, 'github')
  assert.equal(universalProviderRegistry.getByCapability('github.workflow_runs.read').metadata.providerId, 'github')
  const isolated = createUniversalProviderRegistry()
  assert.notEqual(isolated, universalProviderRegistry)
  assert.equal(isolated.findCapability('github', 'github.security_alerts.summary').readOnly, true)
})

test('validates connection, lists repositories, reads metadata, rate limits, and rejects mutations without leaking tokens', async () => {
  const gh = adapter({ '/user': response({ login:'octocat' }), '/user/repos?per_page=100': response([{ id:1, full_name:'SignalBoost/signalboost-live', private:true, default_branch:'main', archived:false, disabled:false }]), '/rate_limit': response({ resources:{ core:{ limit:5000, remaining:42, reset:1893456000, used:1 } } }) })
  const valid = await gh.validateConnection(config); assert.equal(valid.ok, true)
  const repos = await gh.observe(config, 'github.repositories.list'); assert.equal(repos.ok, true); if (repos.ok) assert.equal(repos.value[0].resourceId, 'SignalBoost/signalboost-live')
  const rate = await gh.getRateLimit(config); assert.equal(rate.ok, true); if (rate.ok) assert.equal(rate.value.remaining, 42)
  const mutation = gh.rejectMutation('workflow_dispatch'); assert.equal(mutation.ok, false); if (!mutation.ok) assert.equal(mutation.error.kind, 'unsupported_mutation')
  assert.doesNotMatch(JSON.stringify([valid,repos,rate,mutation]), /ghp_secret|authorization/i)
})

test('normalizes GitHub HTTP and malformed response failures', async () => {
  for (const [status, kind] of [[401,'authentication'],[403,'authorization'],[404,'not_found'],[429,'rate_limited'],[500,'provider_outage']] as const) {
    const result = await adapter({ '/user': response({message:'x'}, status) }).validateConnection(config)
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.kind, kind)
  }
  const malformed = await adapter({ '/user': response({ nope:true }) }).validateConnection(config)
  assert.equal(malformed.ok, false); if (!malformed.ok) assert.equal(malformed.error.kind, 'malformed_response')
})

test('redacts organization-scoped provider connection credentials and isolates organizations', () => {
  const connection: GitHubConnection = { organizationId:'org_a', providerId:'github', credential:{kind:'secret_ref', ref:'vault://org_a/github'}, status:'valid', configurationVersion:2, disabled:false, revoked:false, lastValidatedAt:'2026-07-17T00:00:00.000Z', scopes:['repo:read'] }
  const safe = redactProviderConnection(connection)
  assert.deepEqual(Object.keys(safe).sort(), ['configurationVersion','disabled','lastValidatedAt','organizationId','providerId','revoked','scopes','status'].sort())
  assert.doesNotMatch(JSON.stringify(safe), /vault|secret|credential/i)
  const store = new InMemoryProviderConnectionStore(); store.save(connection)
  assert.equal(store.getSafe('org_b','github'), undefined)
  assert.equal(store.getCredentialRef('org_a','github'), 'vault://org_a/github')
})

test('scheduler deduplicates by deterministic work id and handles disabled, revoked, queue, and rate pressure', () => {
  const input = { organizationId:'org', providerId:'github' as const, resourceId:'repo', capability:'github.repository.read' as const, windowStart:'2026-07-17T00:00:00.000Z', queueDepth:0, rateLimitRemaining:100 }
  assert.equal(createGitHubScheduleWork(input)?.workItemId, createGitHubScheduleWork(input)?.workItemId)
  assert.equal(createGitHubScheduleWork({ ...input, disabled:true }), undefined)
  assert.equal(createGitHubScheduleWork({ ...input, revoked:true }), undefined)
  assert.equal(createGitHubScheduleWork({ ...input, queueDepth:999 }), undefined)
  assert.equal(createGitHubScheduleWork({ ...input, rateLimitRemaining:0 }), undefined)
})

test('webhook ingestion verifies signature, deduplicates, rejects unsupported events, and creates durable work', () => {
  const body = JSON.stringify({ repository:{ full_name:'SignalBoost/signalboost-live' } }); const secret='hook'; const sig='sha256='+createHmac('sha256',secret).update(body).digest('hex'); const store = new InMemoryWebhookDeliveryStore()
  const ok = ingestGitHubWebhook({ secret, body, signature:sig, deliveryId:'d1', event:'workflow_run', organizationId:'org', store, now:'2026-07-17T00:00:00.000Z' })
  assert.equal(ok.status, 202); assert.equal(ok.workItem?.provider, 'github')
  assert.equal(ingestGitHubWebhook({ secret, body, signature:sig, deliveryId:'d1', event:'workflow_run', organizationId:'org', store, now:'2026-07-17T00:00:00.000Z' }).status, 409)
  assert.equal(ingestGitHubWebhook({ secret, body, signature:'bad', deliveryId:'d2', event:'push', organizationId:'org', store, now:'2026-07-17T00:00:00.000Z' }).status, 401)
  assert.equal(ingestGitHubWebhook({ secret, body, signature:sig, deliveryId:'d3', event:'issues', organizationId:'org', store, now:'2026-07-17T00:00:00.000Z' }).status, 400)
})

test('supervisor lifecycle validates ownership, lease, fencing, verification, evidence, and audit transitions', async () => {
  const store = new InMemoryCoordinationStore(); const registry = createUniversalProviderRegistry()
  await store.registerInstance({ instanceId:'s1', runtimeId:'r1', startedAt:'2026-07-17T00:00:00.000Z', heartbeatAt:'2026-07-17T00:00:00.000Z', softwareVersion:'test', schemaVersion:'v1', supportedProviderKinds:['github'], status:'healthy' })
  const work = createGitHubScheduleWork({ organizationId:'org_1', providerId:'github', resourceId:'signalboost-live', capability:'github.repository.read', windowStart:'2026-07-17T00:00:00.000Z', queueDepth:0, rateLimitRemaining:100 })!
  await store.enqueueWorkItem({ ...work, projectId:'SignalBoost' })
  const lease = await store.acquireLease({ workItemId:work.workItemId, ownerInstanceId:'s1', ownerRuntimeId:'r1', leaseDurationMs:31536000000, now:new Date() })
  const observations = await runGitHubObservationWork({ store, registry, adapter: adapter({ '/repos/SignalBoost/signalboost-live': response({ full_name:'SignalBoost/signalboost-live', private:true, default_branch:'main', archived:false, disabled:false }) }), workItem:{ ...work, state:'leased', projectId:'SignalBoost' }, owner:ownershipIdentity(lease), config, capability:'github.repository.read', evidence:{ persist: async o => o.evidenceReferences.map(e=>e.evidenceId) }, audit:{ persist: async () => undefined } })
  assert.equal(observations[0].verificationStatus, 'verified')
  assert.equal((await store.getWorkItem(work.workItemId))?.state, 'completed')
})
