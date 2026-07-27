import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'

import {
  createSharedSecretAuthenticator,
  createHmacSignatureAuthenticator,
  createTrustedNetworkAuthenticator,
  AuthenticatorConfigError,
  AUTHENTICATOR_DEFAULTS,
} from '../lib/supervisor/portable/monitoring-authenticators.ts'

const SECRET = 'a-sufficiently-long-shared-secret'
const NOW = new Date('2026-07-27T12:00:00.000Z')
const nowSeconds = Math.floor(NOW.getTime() / 1000)
const delivery = (headers: Record<string, string>, rawBody = '{"provider":"p","errorMessage":"m"}') => ({ headers, rawBody })

test('shared secret accepts the configured value and nothing else', () => {
  const auth = createSharedSecretAuthenticator({ secret: SECRET, headerName: 'x-supervisor-secret' })
  assert.equal(auth(delivery({ 'x-supervisor-secret': SECRET })).ok, true)
  assert.equal(auth(delivery({ 'x-supervisor-secret': 'wrong-but-long-enough-value' })).reason, 'bad_shared_secret')
  assert.equal(auth(delivery({})).reason, 'missing_shared_secret')
})

test('shared secret matches headers case-insensitively and supports rotation', () => {
  const auth = createSharedSecretAuthenticator({ secret: [SECRET, 'the-previous-shared-secret-value'], headerName: 'x-supervisor-secret' })
  assert.equal(auth(delivery({ 'X-Supervisor-Secret': SECRET })).ok, true)
  assert.equal(auth(delivery({ 'x-supervisor-secret': 'the-previous-shared-secret-value' })).ok, true)
})

test('hmac signature verifies the raw body', () => {
  const auth = createHmacSignatureAuthenticator({ secret: SECRET, headerName: 'x-vendor-signature' })
  const body = '{"provider":"p","errorMessage":"m"}'
  const signature = createHmac('sha256', SECRET).update(body).digest('hex')
  assert.equal(auth({ headers: { 'x-vendor-signature': signature }, rawBody: body }).ok, true)
  assert.equal(auth({ headers: { 'x-vendor-signature': signature }, rawBody: `${body} ` }).reason, 'bad_signature')
  assert.equal(auth({ headers: {}, rawBody: body }).reason, 'missing_signature')
})

test('timestamped signatures enforce replay and future windows', () => {
  const auth = createHmacSignatureAuthenticator({ secret: SECRET, headerName: 'x-sig', timestampHeader: 'x-ts', now: () => NOW })
  const body = '{"a":1}'
  const old = String(nowSeconds - 1000)
  const oldSignature = createHmac('sha256', SECRET).update(`${old}.${body}`).digest('hex')
  assert.equal(auth({ headers: { 'x-sig': oldSignature, 'x-ts': old }, rawBody: body }).reason, 'timestamp_outside_replay_window')
  const fresh = String(nowSeconds)
  const freshSignature = createHmac('sha256', SECRET).update(`${fresh}.${body}`).digest('hex')
  assert.equal(auth({ headers: { 'x-sig': freshSignature, 'x-ts': fresh }, rawBody: body }).ok, true)
})

test('weak configuration and implicit trust fail closed', () => {
  assert.throws(() => createSharedSecretAuthenticator({ secret: '', headerName: 'x' }), AuthenticatorConfigError)
  assert.throws(() => createSharedSecretAuthenticator({ secret: 'too-short', headerName: 'x' }), AuthenticatorConfigError)
  assert.ok(AUTHENTICATOR_DEFAULTS.minSecretLength >= 16)
  assert.throws(() => createTrustedNetworkAuthenticator('mTLS'), AuthenticatorConfigError)
  assert.equal(createTrustedNetworkAuthenticator('mutual TLS terminated at the ingress gateway')({ headers: {}, rawBody: '' }).ok, true)
})

test('the host mounts no source when no secret is configured', async () => {
  const { resetIncidentIntakeForTests, getIncidentIntake } = await import('../self-healing-host/incident-intake.ts')
  const saved = { ...process.env }
  for (const key of Object.keys(process.env)) if (key.startsWith('SUPERVISOR_INTAKE_SECRET')) delete process.env[key]
  resetIncidentIntakeForTests()
  const { notes } = getIncidentIntake()
  assert.ok(notes.every(note => !note.mounted))
  resetIncidentIntakeForTests()
  process.env = saved
})

test('the host mounts only configured sources and authenticates them', async () => {
  const { resetIncidentIntakeForTests, getIncidentIntake, VENDOR_SECRET_HEADER } = await import('../self-healing-host/incident-intake.ts')
  const saved = { ...process.env }
  for (const key of Object.keys(process.env)) if (key.startsWith('SUPERVISOR_INTAKE_SECRET')) delete process.env[key]
  process.env.SUPERVISOR_INTAKE_SECRET_DATADOG = 'a-sufficiently-long-datadog-secret'
  resetIncidentIntakeForTests()
  const { runtime, notes } = getIncidentIntake()
  assert.deepEqual(notes.filter(n => n.mounted).map(n => n.sourceId), ['datadog'])
  const body = JSON.stringify({ id: 'e1', alert_type: 'error', body: 'API 5xx rate high', aggregation_key: 'agg-1', monitor_id: 'm1' })
  const rejected = await runtime.deliver('datadog', { headers: {}, rawBody: body })
  assert.equal(rejected.status === 'rejected' && rejected.reason, 'missing_shared_secret')
  const accepted = await runtime.deliver('datadog', { headers: { [VENDOR_SECRET_HEADER]: 'a-sufficiently-long-datadog-secret' }, rawBody: body })
  assert.equal(accepted.status, 'handled')
  resetIncidentIntakeForTests()
  process.env = saved
})
