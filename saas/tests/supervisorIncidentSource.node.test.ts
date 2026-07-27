// saas/tests/supervisorIncidentSource.node.test.ts
//
// The universal intake contract. Most of these tests are NEGATIVE on purpose: an
// intake path that stays green while dropping real alerts, or while letting a broken
// adapter take the whole socket down, is worse than no intake path at all. The cases
// that matter most are the ones where something upstream misbehaves — a vendor sends
// junk, an adapter throws, the buyer's store is down — and intake still does the
// right, reportable thing.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createIncidentSource,
  createIncidentSourceRegistry,
  createInMemoryDedupeStore,
  createInMemoryIncidentStore,
  fingerprintIncident,
  normalizeEnvironment,
  normalizeSeverity,
  sanitizeMetadata,
  IncidentSourceConfigError,
  INTAKE_LIMITS,
  REDACTED,
  REDACTED_KEYS_FIELD,
  type IncidentMapping,
  type IncidentSourceDefinition,
  type RawIncidentDelivery,
} from '../lib/supervisor/portable/incident-source.ts'

const delivery = (body: unknown, headers: Record<string, string> = {}): RawIncidentDelivery => ({
  headers,
  rawBody: typeof body === 'string' ? body : JSON.stringify(body),
  receivedAt: '2026-07-27T10:00:00.000Z',
})

const baseDefinition = (map: IncidentSourceDefinition['map']): IncidentSourceDefinition => ({
  sourceId: 'acme-monitoring',
  vendor: 'acme',
  status: 'live',
  map,
})

const simpleMap = (body: unknown): IncidentMapping => {
  const b = body as Record<string, unknown>
  return {
    provider: 'acme-apm',
    errorMessage: String(b.message ?? 'unspecified failure'),
    severity: b.severity as string | undefined,
    environment: b.env as string | undefined,
    affectedResource: b.resource as string | undefined,
    dedupeKey: b.alertId as string | undefined,
    metadata: (b.meta as Record<string, unknown>) ?? {},
  }
}

test('accepts a well-formed vendor alert and produces a canonical incident', async () => {
  const source = createIncidentSource(baseDefinition(simpleMap))
  const result = await source.receive(delivery({ message: 'checkout latency above threshold', severity: 'critical', env: 'prod', resource: 'svc/checkout' }))

  assert.equal(result.status, 'accepted')
  if (result.status !== 'accepted') return
  assert.equal(result.incident.provider, 'acme-apm')
  assert.equal(result.incident.environment, 'production')
  assert.equal(result.incident.severity, 'critical')
  assert.equal(result.incident.source, 'webhook')
  assert.equal(result.incident.affectedResource, 'svc/checkout')
  assert.ok(result.incident.evidence.length >= 1, 'schema requires non-empty evidence')
  assert.equal(result.incident.metadata.intakeVendor, 'acme')
  assert.equal(result.incident.metadata.intakeSourceId, 'acme-monitoring')
  assert.ok(result.fingerprint.startsWith('sha256:'))
})

test('redacts secret-shaped metadata instead of rejecting the whole alert', async () => {
  // The canonical schema THROWS on a secret-shaped key. Vendors routinely echo auth
  // material back in a webhook envelope, so rejecting would drop ordinary traffic.
  const source = createIncidentSource(baseDefinition(body => ({
    ...simpleMap(body),
    metadata: { apiKey: 'sk-live-should-never-persist', integration: { token: 'ghp_secret' }, region: 'us-east-1' },
  })))
  const result = await source.receive(delivery({ message: 'boom' }))

  assert.equal(result.status, 'accepted')
  if (result.status !== 'accepted') return
  // The KEY must be gone, not blanked — the schema rejects on the key alone.
  assert.equal('apiKey' in result.incident.metadata, false)
  assert.equal('token' in (result.incident.metadata.integration as Record<string, unknown>), false)
  assert.equal(result.incident.metadata.region, 'us-east-1', 'non-secret fields survive')
  assert.deepEqual(result.incident.metadata[REDACTED_KEYS_FIELD], ['apiKey', 'integration.token'], 'what was removed is reportable')
  assert.ok(!JSON.stringify(result.incident).includes('sk-live-should-never-persist'))
  assert.ok(!JSON.stringify(result.incident).includes('ghp_secret'))
})

test('normalizes vendor severity and environment vocabularies', () => {
  for (const word of ['critical', 'FATAL', 'sev-1', 'P0', 'firing', 'down', 'error']) assert.equal(normalizeSeverity(word), 'critical', word)
  for (const word of ['warn', 'Warning', 'degraded', 'sev-2', 'P3']) assert.equal(normalizeSeverity(word), 'warning', word)
  for (const word of ['info', 'notice', 'ok', 'P5']) assert.equal(normalizeSeverity(word), 'info', word)
  assert.equal(normalizeSeverity(0), 'critical')
  assert.equal(normalizeSeverity(2), 'warning')
  assert.equal(normalizeSeverity(9), 'info')
  assert.equal(normalizeSeverity('something-nobody-mapped'), 'warning', 'unknown severity lands on a defined value')

  for (const word of ['prod', 'PRODUCTION', 'live']) assert.equal(normalizeEnvironment(word), 'production', word)
  for (const word of ['staging', 'qa', 'uat', 'preview']) assert.equal(normalizeEnvironment(word), 'preview', word)
  for (const word of ['sandbox', 'dev', 'local']) assert.equal(normalizeEnvironment(word), 'sandbox', word)
})

test('an unlabelled environment defaults to production, not sandbox', async () => {
  // Guessing sandbox would widen what may run unattended, because the policy engine
  // gates production modifications and lets low-risk sandbox steps through.
  assert.equal(normalizeEnvironment(undefined), 'production')
  assert.equal(normalizeEnvironment('who-knows'), 'production')
  const source = createIncidentSource(baseDefinition(simpleMap))
  const result = await source.receive(delivery({ message: 'no environment supplied' }))
  assert.equal(result.status === 'accepted' && result.incident.environment, 'production')
})

test('deduplicates a repeated alert within the window', async () => {
  const dedupe = createInMemoryDedupeStore()
  const source = createIncidentSource(baseDefinition(simpleMap), { dedupe })
  const payload = { message: 'disk pressure', env: 'prod', resource: 'node-7' }

  const first = await source.receive(delivery(payload))
  const second = await source.receive(delivery(payload))

  assert.equal(first.status, 'accepted')
  assert.equal(second.status, 'duplicate')
  if (second.status !== 'duplicate') return
  assert.equal(second.duplicateOf, first.status === 'accepted' ? first.incident.incidentId : '')
  assert.equal(dedupe.size(), 1)
})

test("the vendor's own dedupe key wins over the message text", async () => {
  // Vendors reword alert text between firings. If the vendor tells us these are the
  // same alert, that beats string comparison.
  const withKey = { provider: 'p', environment: 'production', dedupeKey: 'alert-42', errorMessage: 'first wording' }
  const reworded = { provider: 'p', environment: 'production', dedupeKey: 'alert-42', errorMessage: 'completely different wording' }
  assert.equal(fingerprintIncident(withKey), fingerprintIncident(reworded))

  const noKey = { provider: 'p', environment: 'production', errorMessage: 'first wording' }
  const noKeyOther = { provider: 'p', environment: 'production', errorMessage: 'completely different wording' }
  assert.notEqual(fingerprintIncident(noKey), fingerprintIncident(noKeyOther))
})

test('fingerprints separate different subjects with the same message', () => {
  const a = fingerprintIncident({ provider: 'p', environment: 'production', errorMessage: 'timeout', affectedResource: 'svc/a' })
  const b = fingerprintIncident({ provider: 'p', environment: 'production', errorMessage: 'timeout', affectedResource: 'svc/b' })
  const c = fingerprintIncident({ provider: 'p', environment: 'preview', errorMessage: 'timeout', affectedResource: 'svc/a' })
  assert.notEqual(a, b, 'different resource must not collide')
  assert.notEqual(a, c, 'different environment must not collide')
  assert.equal(a, fingerprintIncident({ provider: 'p', environment: 'production', errorMessage: 'timeout', affectedResource: 'svc/a' }), 'deterministic')
})

test('ignoring is not rejecting — a resolution notice is dropped cleanly', async () => {
  const source = createIncidentSource(baseDefinition(body => ((body as Record<string, unknown>).state === 'resolved' ? null : simpleMap(body))))
  const result = await source.receive(delivery({ state: 'resolved', message: 'recovered' }))

  assert.equal(result.status, 'ignored')
  assert.equal(source.health().ignored, 1)
  assert.equal(source.health().rejected, 0, 'an ignored delivery must not count as a failure')
})

test('an adapter that throws is contained and never takes intake down', async () => {
  let shouldThrow = true
  const source = createIncidentSource(baseDefinition(body => {
    if (shouldThrow) throw new Error('vendor changed their payload shape')
    return simpleMap(body)
  }))

  const bad = await source.receive(delivery({ message: 'x' }))
  assert.equal(bad.status, 'rejected')
  assert.ok(bad.status === 'rejected' && bad.reason.startsWith('mapping_error'))

  shouldThrow = false
  const good = await source.receive(delivery({ message: 'later alert' }))
  assert.equal(good.status, 'accepted', 'the socket still works after a bad adapter call')
})

test('authentication failure rejects before the body is ever mapped', async () => {
  let mapped = 0
  const source = createIncidentSource({
    ...baseDefinition(body => { mapped += 1; return simpleMap(body) }),
    authenticate: d => (d.headers['x-signature'] === 'good' ? { ok: true } : { ok: false, reason: 'bad_signature' }),
  })

  const denied = await source.receive(delivery({ message: 'spoofed' }, { 'x-signature': 'wrong' }))
  assert.equal(denied.status, 'rejected')
  assert.equal(denied.status === 'rejected' && denied.reason, 'bad_signature')
  assert.equal(mapped, 0, 'an unauthenticated payload must not reach adapter code')

  const allowed = await source.receive(delivery({ message: 'real' }, { 'x-signature': 'good' }))
  assert.equal(allowed.status, 'accepted')
  assert.equal(mapped, 1)
})

test('a throwing authenticate is a rejection, not a crash', async () => {
  const source = createIncidentSource({ ...baseDefinition(simpleMap), authenticate: () => { throw new Error('hsm unreachable') } })
  const result = await source.receive(delivery({ message: 'x' }))
  assert.equal(result.status, 'rejected')
  assert.equal(result.status === 'rejected' && result.reason, 'authentication_error')
})

test('a disabled source stops before authentication', async () => {
  let authenticated = 0
  const source = createIncidentSource({
    ...baseDefinition(simpleMap),
    status: 'disabled',
    authenticate: () => { authenticated += 1; return { ok: true } },
  })
  const result = await source.receive(delivery({ message: 'x' }))

  assert.equal(result.status, 'rejected')
  assert.equal(result.status === 'rejected' && result.reason, 'source_disabled')
  assert.equal(authenticated, 0, 'disabling must be a complete stop, not a narrower filter')
})

test('malformed and incomplete deliveries are rejected with a named reason', async () => {
  const source = createIncidentSource(baseDefinition(simpleMap))
  const notJson = await source.receive({ headers: {}, rawBody: 'not json at all' })
  assert.equal(notJson.status === 'rejected' && notJson.reason, 'invalid_json')

  const noProvider = createIncidentSource(baseDefinition(() => ({ provider: '  ', errorMessage: 'boom' })))
  assert.equal((await noProvider.receive(delivery({}))).status === 'rejected', true)

  const noMessage = createIncidentSource(baseDefinition(() => ({ provider: 'p', errorMessage: '' })))
  const result = await noMessage.receive(delivery({}))
  assert.equal(result.status === 'rejected' && result.reason, 'mapping_missing_error_message')
})

test('synthesizes evidence when a vendor supplies none', async () => {
  // The schema requires non-empty evidence and that is correct — an incident nobody
  // can look into cannot be diagnosed. Intake must not fail closed over it.
  const source = createIncidentSource(baseDefinition(() => ({ provider: 'p', errorMessage: 'thin alert with no detail' })))
  const result = await source.receive(delivery({}))

  assert.equal(result.status, 'accepted')
  if (result.status !== 'accepted') return
  assert.equal(result.incident.evidence.length, 1)
  assert.equal(result.incident.evidence[0].type, 'vendor_alert')
  assert.equal(result.incident.evidence[0].summary, 'thin alert with no detail')
})

test('a failed persist rejects and does NOT remember the fingerprint', async () => {
  // Remembering a fingerprint for an incident that was never stored would suppress
  // the next real firing of the same problem. This is the ordering that matters most.
  const dedupe = createInMemoryDedupeStore()
  let failing = true
  const source = createIncidentSource(baseDefinition(simpleMap), {
    dedupe,
    store: { async persist() { if (failing) throw new Error('datastore unreachable') } },
  })

  const failed = await source.receive(delivery({ message: 'db connections exhausted' }))
  assert.equal(failed.status, 'rejected')
  assert.ok(failed.status === 'rejected' && failed.reason.startsWith('persist_failed'))
  assert.equal(dedupe.size(), 0, 'a fingerprint must never outlive a failed persist')

  failing = false
  const retried = await source.receive(delivery({ message: 'db connections exhausted' }))
  assert.equal(retried.status, 'accepted', 'the same alert is still accepted after the store recovers')
})

test('a broken dedupe store fails open rather than dropping incidents', async () => {
  const source = createIncidentSource(baseDefinition(simpleMap), {
    dedupe: { async seen() { throw new Error('cache down') }, async remember() { throw new Error('cache down') } },
  })
  const result = await source.receive(delivery({ message: 'still needs handling' }))
  assert.equal(result.status, 'accepted', 'a dedupe outage must not silence real alerts')
})

test('persists through the incident store with its fingerprint', async () => {
  const store = createInMemoryIncidentStore()
  const source = createIncidentSource(baseDefinition(simpleMap), { store })
  const result = await source.receive(delivery({ message: 'queue backlog growing' }))

  assert.equal(result.status, 'accepted')
  assert.equal(store.all().length, 1)
  assert.equal(store.all()[0].fingerprint, result.status === 'accepted' ? result.fingerprint : '')
})

test('bounds oversized payloads', async () => {
  const huge = 'x'.repeat(INTAKE_LIMITS.maxStringLength + 500)
  const manyKeys: Record<string, unknown> = {}
  for (let i = 0; i < INTAKE_LIMITS.maxMetadataEntries + 50; i += 1) manyKeys[`k${i}`] = i
  const source = createIncidentSource(baseDefinition(() => ({
    provider: 'p',
    errorMessage: huge,
    metadata: manyKeys,
    evidence: Array.from({ length: INTAKE_LIMITS.maxEvidenceItems + 10 }, (_, i) => ({ summary: `evidence ${i}` })),
  })))
  const result = await source.receive(delivery({}))

  assert.equal(result.status, 'accepted')
  if (result.status !== 'accepted') return
  assert.ok(result.incident.errorMessage.length <= INTAKE_LIMITS.maxStringLength + 1)
  assert.equal(result.incident.evidence.length, INTAKE_LIMITS.maxEvidenceItems)
  assert.ok(Object.keys(result.incident.metadata).length <= INTAKE_LIMITS.maxMetadataEntries + 8)
})

test('sanitizes deeply nested and non-serializable metadata', () => {
  let deep: Record<string, unknown> = { value: 'bottom' }
  for (let i = 0; i < INTAKE_LIMITS.maxMetadataDepth + 4; i += 1) deep = { nested: deep }
  const cleaned = sanitizeMetadata({ deep, fn: () => 'nope', bad: NaN, list: [1, 'two', null] })

  assert.equal(cleaned.fn, undefined, 'functions are dropped')
  assert.equal(cleaned.bad, null, 'non-finite numbers become null')
  assert.deepEqual(cleaned.list, [1, 'two', null])
  assert.ok(JSON.stringify(cleaned).includes(REDACTED), 'depth beyond the limit is truncated')
})

test('reports health honestly across every outcome', async () => {
  const source = createIncidentSource(baseDefinition(body => {
    const b = body as Record<string, unknown>
    if (b.skip) return null
    return simpleMap(body)
  }), { dedupe: createInMemoryDedupeStore() })

  await source.receive(delivery({ message: 'one', alertId: 'a' }))
  await source.receive(delivery({ message: 'one', alertId: 'a' }))
  await source.receive(delivery({ skip: true }))
  await source.receive({ headers: {}, rawBody: '{' })

  const health = source.health()
  assert.equal(health.received, 4)
  assert.equal(health.accepted, 1)
  assert.equal(health.duplicates, 1)
  assert.equal(health.ignored, 1)
  assert.equal(health.rejected, 1)
  assert.equal(health.lastRejectionReason, 'invalid_json')
  assert.equal(health.status, 'live')
  assert.throws(() => { (health as { received: number }).received = 99 }, 'health output is frozen')
})

test('rejects misconfiguration when the source is wired, not when an alert arrives', () => {
  assert.throws(() => createIncidentSource({ ...baseDefinition(simpleMap), sourceId: '' }), IncidentSourceConfigError)
  assert.throws(() => createIncidentSource({ ...baseDefinition(simpleMap), vendor: '  ' }), IncidentSourceConfigError)
  assert.throws(() => createIncidentSource({ sourceId: 'a', vendor: 'b', status: 'live' } as IncidentSourceDefinition), IncidentSourceConfigError)
})

test('the registry surfaces which vendors are live and which are only staged', () => {
  const live = createIncidentSource({ ...baseDefinition(simpleMap), sourceId: 'live-one' })
  const staged = createIncidentSource({ ...baseDefinition(simpleMap), sourceId: 'staged-one', status: 'staged' })
  const registry = createIncidentSourceRegistry([live, staged])

  assert.deepEqual(registry.liveSourceIds(), ['live-one'])
  assert.equal(registry.list().length, 2)
  assert.equal(registry.get('staged-one')?.status, 'staged')
  assert.equal(registry.health().length, 2)
  assert.throws(() => createIncidentSourceRegistry([live, live]), IncidentSourceConfigError)
})

test('the accepted incident is exactly what the orchestrator already validates', async () => {
  // The point of the whole contract: intake produces the EXISTING canonical incident,
  // not a second format the rest of the portable would have to learn.
  const { incidentSchema } = await import('../lib/supervisor/incident-schema.ts')
  const source = createIncidentSource(baseDefinition(simpleMap))
  const result = await source.receive(delivery({ message: 'reparse me', env: 'staging', severity: 'warn' }))

  assert.equal(result.status, 'accepted')
  if (result.status !== 'accepted') return
  const reparsed = incidentSchema.parse(JSON.parse(JSON.stringify(result.incident)))
  assert.deepEqual(reparsed, result.incident, 'an accepted incident survives a round trip through the canonical schema')
})
