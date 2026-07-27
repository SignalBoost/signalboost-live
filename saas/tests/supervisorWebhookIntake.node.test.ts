// saas/tests/supervisorWebhookIntake.node.test.ts
//
// The generic signed webhook. This is the one intake path exposed directly to the
// public internet, so the tests that matter are the ones proving what it REFUSES:
// a replayed capture, a tampered body, a forged signature, an oversized payload.
// A webhook that accepts everything is not an integration, it is an open door.

import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'

import {
  createSignedWebhookSource,
  signIntakeRequest,
  INTAKE_ENVELOPE_VERSION,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  WEBHOOK_DEFAULTS,
  WebhookIntakeConfigError,
} from '../lib/supervisor/portable/webhook-intake.ts'
import { createInMemoryDedupeStore } from '../lib/supervisor/portable/incident-source.ts'

const SECRET = 'a-sufficiently-long-signing-secret'
const FIXED_NOW = new Date('2026-07-27T12:00:00.000Z')
const nowSeconds = Math.floor(FIXED_NOW.getTime() / 1000)

const envelope = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  schemaVersion: INTAKE_ENVELOPE_VERSION,
  provider: 'acme-internal-monitor',
  errorMessage: 'payment worker queue is not draining',
  environment: 'production',
  severity: 'critical',
  affectedResource: 'worker/payments',
  ...overrides,
})

const signed = (body: string, opts: { secret?: string; timestamp?: number } = {}) => {
  const timestamp = opts.timestamp ?? nowSeconds
  return {
    headers: {
      [TIMESTAMP_HEADER]: String(timestamp),
      [SIGNATURE_HEADER]: signIntakeRequest(opts.secret ?? SECRET, timestamp, body),
    },
    rawBody: body,
  }
}

const source = (overrides: Record<string, unknown> = {}) =>
  createSignedWebhookSource({ secret: SECRET, now: () => FIXED_NOW, ...overrides })

test('accepts a correctly signed envelope and produces a canonical incident', async () => {
  const body = envelope()
  const result = await source().receive(signed(body))

  assert.equal(result.status, 'accepted')
  if (result.status !== 'accepted') return
  assert.equal(result.incident.provider, 'acme-internal-monitor')
  assert.equal(result.incident.environment, 'production')
  assert.equal(result.incident.severity, 'critical')
  assert.equal(result.incident.affectedResource, 'worker/payments')
  assert.equal(result.incident.source, 'webhook')
  assert.equal(result.incident.metadata.intakeVendor, 'generic')
})

test('rejects a forged signature', async () => {
  const body = envelope()
  const result = await source().receive({
    headers: { [TIMESTAMP_HEADER]: String(nowSeconds), [SIGNATURE_HEADER]: 'v1=' + 'f'.repeat(64) },
    rawBody: body,
  })
  assert.equal(result.status === 'rejected' && result.reason, 'bad_signature')
})

test('rejects a tampered body — the signature covers the payload', async () => {
  const original = envelope()
  const delivery = signed(original)
  const tampered = { ...delivery, rawBody: envelope({ errorMessage: 'something far more urgent' }) }

  const result = await source().receive(tampered)
  assert.equal(result.status === 'rejected' && result.reason, 'bad_signature')
})

test('a captured request cannot be replayed with a fresh timestamp', async () => {
  // The timestamp is inside the signed material, so swapping it invalidates the
  // signature. This is the property that makes the replay window meaningful.
  const body = envelope()
  const captured = signed(body, { timestamp: nowSeconds - 1000 })
  const restamped = { ...captured, headers: { ...captured.headers, [TIMESTAMP_HEADER]: String(nowSeconds) } }

  const result = await source().receive(restamped)
  assert.equal(result.status === 'rejected' && result.reason, 'bad_signature')
})

test('rejects a valid signature that is simply too old', async () => {
  const body = envelope()
  const stale = signed(body, { timestamp: nowSeconds - (WEBHOOK_DEFAULTS.replayWindowSeconds + 30) })

  const result = await source().receive(stale)
  assert.equal(result.status === 'rejected' && result.reason, 'timestamp_outside_replay_window')
})

test('accepts modest clock skew but rejects a timestamp from the future', async () => {
  const nearFuture = signed(envelope(), { timestamp: nowSeconds + 30 })
  assert.equal((await source().receive(nearFuture)).status, 'accepted')

  const farFuture = signed(envelope(), { timestamp: nowSeconds + 6000 })
  const result = await source().receive(farFuture)
  assert.equal(result.status === 'rejected' && result.reason, 'timestamp_in_future')
})

test('rejects missing signature and timestamp headers by name', async () => {
  const body = envelope()
  const noTimestamp = await source().receive({ headers: { [SIGNATURE_HEADER]: signIntakeRequest(SECRET, nowSeconds, body) }, rawBody: body })
  assert.equal(noTimestamp.status === 'rejected' && noTimestamp.reason, 'missing_timestamp')

  const noSignature = await source().receive({ headers: { [TIMESTAMP_HEADER]: String(nowSeconds) }, rawBody: body })
  assert.equal(noSignature.status === 'rejected' && noSignature.reason, 'missing_signature')

  const badTimestamp = await source().receive({ headers: { [TIMESTAMP_HEADER]: 'yesterday', [SIGNATURE_HEADER]: 'v1=abc' }, rawBody: body })
  assert.equal(badTimestamp.status === 'rejected' && badTimestamp.reason, 'invalid_timestamp')
})

test('rejects an oversized payload before doing any work on it', async () => {
  const huge = JSON.stringify({ provider: 'p', errorMessage: 'x', filler: 'y'.repeat(WEBHOOK_DEFAULTS.maxBodyBytes) })
  const result = await source().receive(signed(huge))
  assert.equal(result.status === 'rejected' && result.reason, 'payload_too_large')
})

test('measures the size limit in bytes, not characters', async () => {
  // A multi-byte payload that looks short by string length must still be bounded.
  const small = createSignedWebhookSource({ secret: SECRET, now: () => FIXED_NOW, maxBodyBytes: 200 })
  const multibyte = JSON.stringify({ provider: 'p', errorMessage: '🚀'.repeat(80) })
  assert.ok(multibyte.length < 400 && Buffer.byteLength(multibyte, 'utf8') > 200)

  const result = await small.receive(signed(multibyte))
  assert.equal(result.status === 'rejected' && result.reason, 'payload_too_large')
})

test('supports secret rotation without dropping alerts', async () => {
  const rotating = createSignedWebhookSource({ secret: ['the-new-signing-secret-value', 'the-old-signing-secret-value'], now: () => FIXED_NOW })
  const body = envelope()

  assert.equal((await rotating.receive(signed(body, { secret: 'the-new-signing-secret-value' }))).status, 'accepted')
  assert.equal((await rotating.receive(signed(body, { secret: 'the-old-signing-secret-value' }))).status, 'accepted')

  const retired = await rotating.receive(signed(body, { secret: 'a-secret-that-was-already-retired' }))
  assert.equal(retired.status === 'rejected' && retired.reason, 'bad_signature')
})

test('accepts a bare hex signature as well as the v1= prefixed form', async () => {
  const body = envelope()
  const bare = createHmac('sha256', SECRET).update(`${nowSeconds}.${body}`).digest('hex')
  const result = await source().receive({ headers: { [TIMESTAMP_HEADER]: String(nowSeconds), [SIGNATURE_HEADER]: bare }, rawBody: body })
  assert.equal(result.status, 'accepted')
})

test('matches headers case-insensitively, as real HTTP stacks deliver them', async () => {
  const body = envelope()
  const timestamp = String(nowSeconds)
  const result = await source().receive({
    headers: { 'X-Supervisor-Timestamp': timestamp, 'X-Supervisor-Signature': signIntakeRequest(SECRET, timestamp, body) },
    rawBody: body,
  })
  assert.equal(result.status, 'accepted')
})

test('a resolution notice is ignored, not rejected', async () => {
  const src = source()
  const result = await src.receive(signed(envelope({ resolved: true })))
  assert.equal(result.status, 'ignored')
  const health = src.health()
  assert.equal(health.ignored, 1)
  assert.equal(health.rejected, 0, 'a recovery notice must not read as an intake failure')
})

test('rejects an envelope from an unknown schema version', async () => {
  const result = await source().receive(signed(envelope({ schemaVersion: 'supervisor-incident-intake-v99' })))
  assert.equal(result.status, 'rejected')
  assert.ok(result.status === 'rejected' && result.reason.includes('unsupported schemaVersion'))
})

test('accepts an envelope with no schemaVersion at all', async () => {
  // A shell script with curl is a supported sender. Requiring the version field
  // would make the simplest possible integration fail for no security benefit.
  const body = JSON.stringify({ provider: 'cron-script', errorMessage: 'nightly reconciliation did not run' })
  assert.equal((await source().receive(signed(body))).status, 'accepted')
})

test('rejects an envelope missing the two required fields', async () => {
  const noProvider = await source().receive(signed(JSON.stringify({ errorMessage: 'something broke' })))
  assert.equal(noProvider.status === 'rejected' && noProvider.reason, 'mapping_missing_provider')

  const noMessage = await source().receive(signed(JSON.stringify({ provider: 'p' })))
  assert.equal(noMessage.status === 'rejected' && noMessage.reason, 'mapping_missing_error_message')
})

test('carries evidence, metadata and the dedupe key through to the incident', async () => {
  const dedupe = createInMemoryDedupeStore()
  const src = createSignedWebhookSource({ secret: SECRET, now: () => FIXED_NOW }, { dedupe })
  const body = envelope({
    dedupeKey: 'monitor-alert-8891',
    evidence: [{ type: 'query_result', summary: 'queue depth 41000 and rising', reference: 'https://monitor.internal/q/1' }],
    metadata: { team: 'payments', runbook: 'RB-114' },
  })

  const first = await src.receive(signed(body))
  assert.equal(first.status, 'accepted')
  if (first.status !== 'accepted') return
  assert.equal(first.incident.evidence[0].type, 'query_result')
  assert.equal(first.incident.evidence[0].reference, 'https://monitor.internal/q/1')
  assert.equal(first.incident.metadata.team, 'payments')
  assert.equal(first.incident.metadata.intakeDedupeKey, 'monitor-alert-8891')

  // Same dedupe key, different wording — still the same incident.
  const second = await src.receive(signed(envelope({ dedupeKey: 'monitor-alert-8891', errorMessage: 'queue still not draining' })))
  assert.equal(second.status, 'duplicate')
})

test('strips secret-shaped metadata a sender should never have included', async () => {
  const body = envelope({ metadata: { apiKey: 'sk-live-leaked', team: 'sre' } })
  const result = await source().receive(signed(body))

  assert.equal(result.status, 'accepted')
  if (result.status !== 'accepted') return
  assert.equal('apiKey' in result.incident.metadata, false)
  assert.equal(result.incident.metadata.team, 'sre')
  assert.ok(!JSON.stringify(result.incident).includes('sk-live-leaked'))
})

test('refuses a weak or absent signing secret when the deployment is wired', () => {
  assert.throws(() => createSignedWebhookSource({ secret: '' }), WebhookIntakeConfigError)
  assert.throws(() => createSignedWebhookSource({ secret: [] }), WebhookIntakeConfigError)
  assert.throws(() => createSignedWebhookSource({ secret: 'too-short' }), WebhookIntakeConfigError)
  assert.throws(() => createSignedWebhookSource({ secret: [SECRET, 'short'] }), WebhookIntakeConfigError)
})

test('a disabled webhook stops before signature checking', async () => {
  const disabled = createSignedWebhookSource({ secret: SECRET, status: 'disabled', now: () => FIXED_NOW })
  const result = await disabled.receive(signed(envelope()))
  assert.equal(result.status === 'rejected' && result.reason, 'source_disabled')
})

test('signature comparison does not throw on a malformed length', async () => {
  for (const bogus of ['v1=', 'v1=zz', 'not-even-hex', 'v1=' + 'a'.repeat(500)]) {
    const result = await source().receive({ headers: { [TIMESTAMP_HEADER]: String(nowSeconds), [SIGNATURE_HEADER]: bogus }, rawBody: envelope() })
    assert.equal(result.status, 'rejected', bogus)
    assert.equal(result.status === 'rejected' && result.reason, 'bad_signature', bogus)
  }
})

test('rejects a non-JSON body that is otherwise correctly signed', async () => {
  const result = await source().receive(signed('this is not json'))
  assert.equal(result.status === 'rejected' && result.reason, 'invalid_json')
})

test('signIntakeRequest is a stable, documented scheme senders can reproduce', () => {
  const body = '{"provider":"p","errorMessage":"m"}'
  const expected = `v1=${createHmac('sha256', SECRET).update(`1769000000.${body}`).digest('hex')}`
  assert.equal(signIntakeRequest(SECRET, 1769000000, body), expected)
  assert.equal(signIntakeRequest(SECRET, '1769000000', body), expected, 'string and numeric timestamps agree')
})
