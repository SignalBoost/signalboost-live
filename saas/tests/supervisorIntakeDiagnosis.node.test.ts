// saas/tests/supervisorIntakeDiagnosis.node.test.ts
//
// What the intake endpoint actually does to an accepted alert, end to end.
//
// This lives in its own file on purpose. The assertion that matters most here — that
// the record does not claim more than happened — has already been dropped once when
// the wiring suite was rewritten, and it is the single easiest thing to lose: nothing
// fails when a system overstates itself, it just quietly becomes untrustworthy.
//
// Both directions are asserted. Underclaiming is a bug too: an alert that WAS
// diagnosed and gated should say so, or the operator learns nothing from the record.

import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'

import { issueLicense } from '../portable-license/issue.ts'
import { featuresForEdition } from '../portable-license/catalog.ts'

const SECRET = 'a-sufficiently-long-datadog-secret'

// Diagnosis is a licensed capability, so these tests install a REAL licence rather
// than bypassing the gate. Testing the intake path with the gate disabled would prove
// only that an unlicensed deployment behaves the same as a licensed one, which is the
// opposite of what the licence is for.
const ISSUER = 'signalboost-test'
const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const LICENSE_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString()
const LICENSE_TOKEN = issueLicense({
  schema: 'portable-license/1',
  licenseId: 'lic-intake-test',
  issuer: ISSUER,
  licensee: 'Intake Test',
  productId: 'self-healing-supervisor',
  edition: 'enterprise',
  features: featuresForEdition('self-healing-supervisor', 'enterprise') ?? ['repair.plan'],
  seats: null,
  maxExecutions: null,
  issuedAt: new Date(Date.now() - 1000).toISOString(),
  notBefore: new Date(Date.now() - 1000).toISOString(),
  expiresAt: new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString(),
  graceDays: 0,
}, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())

const datadogAlert = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  id: `evt-${Math.random().toString(36).slice(2, 10)}`,
  alert_type: 'error',
  title: '[Triggered] checkout availability',
  body: 'checkout endpoint returning 503 and failing health checks',
  aggregation_key: `agg-${Math.random().toString(36).slice(2, 10)}`,
  monitor_id: 'm-4471',
  host: 'svc/checkout',
  ...overrides,
})

async function withDatadogSource<T>(run: (mod: typeof import('../self-healing-host/incident-intake.ts')) => Promise<T>): Promise<T> {
  const mod = await import('../self-healing-host/incident-intake.ts')
  const saved = { ...process.env }
  for (const key of Object.keys(process.env)) if (key.startsWith('SUPERVISOR_INTAKE_SECRET')) delete process.env[key]
  process.env.SUPERVISOR_INTAKE_SECRET_DATADOG = SECRET
  process.env.SUPERVISOR_LICENSE_TOKEN = LICENSE_TOKEN
  process.env.SUPERVISOR_LICENSE_ISSUER = ISSUER
  process.env.SUPERVISOR_LICENSE_PUBLIC_KEYS = LICENSE_PUBLIC_KEY
  const entitlement = await import('../self-healing-host/supervisor-entitlement.ts')
  entitlement.resetSupervisorEntitlementForTests()
  mod.resetIncidentIntakeForTests()
  try {
    return await run(mod)
  } finally {
    mod.resetIncidentIntakeForTests()
    entitlement.resetSupervisorEntitlementForTests()
    for (const key of Object.keys(process.env)) if (key.startsWith('SUPERVISOR_')) delete process.env[key]
    Object.assign(process.env, saved)
  }
}

test('an accepted alert is diagnosed and gated by the shipped policy', async () => {
  await withDatadogSource(async ({ getIncidentIntake, VENDOR_SECRET_HEADER }) => {
    const { runtime } = getIncidentIntake()
    const result = await runtime.deliver('datadog', { headers: { [VENDOR_SECRET_HEADER]: SECRET }, rawBody: datadogAlert() })

    assert.equal(result.status, 'handled')
    if (result.status !== 'handled') return
    assert.ok(result.record.reason.includes('diagnosed'), 'the alert was diagnosed, and the record says so')
    assert.ok(result.record.reason.includes('policy approved'), 'the policy verdict is recorded')
  })
})

test('the record does NOT claim the incident was repaired', async () => {
  // No execution step runner is configured, so the only honest terminal state is
  // unresolved. A `completed` here would mean the audit trail says a production
  // incident was handled when nothing ran.
  await withDatadogSource(async ({ getIncidentIntake, VENDOR_SECRET_HEADER }) => {
    const { runtime } = getIncidentIntake()
    const result = await runtime.deliver('datadog', { headers: { [VENDOR_SECRET_HEADER]: SECRET }, rawBody: datadogAlert() })

    assert.equal(result.status, 'handled')
    if (result.status !== 'handled') return
    assert.equal(result.record.status, 'unresolved')
    assert.notEqual(result.record.status, 'completed')
    assert.ok(!/repaired|resolved|fixed/i.test(result.record.reason), `the reason must not read as a repair: ${result.record.reason}`)
  })
})

test('the full audit trail is written for every accepted alert', async () => {
  await withDatadogSource(async ({ getIncidentIntake, recentIntakeAudit, VENDOR_SECRET_HEADER }) => {
    const { runtime } = getIncidentIntake()
    await runtime.deliver('datadog', { headers: { [VENDOR_SECRET_HEADER]: SECRET }, rawBody: datadogAlert() })

    const types = recentIntakeAudit().map(event => event.eventType)
    for (const expected of ['incident_received', 'thinker_started', 'plan_generated', 'policy_evaluated', 'execution_started', 'execution_completed', 'verification_completed']) {
      assert.ok(types.includes(expected as never), `missing audit event: ${expected}`)
    }
  })
})

test('a rejected alert is never diagnosed and leaves no audit trail', async () => {
  // Authentication runs before anything else. An unauthenticated caller must not be
  // able to make the system do work, or the endpoint becomes an amplifier.
  await withDatadogSource(async ({ getIncidentIntake, recentIntakeAudit }) => {
    const { runtime } = getIncidentIntake()
    const result = await runtime.deliver('datadog', { headers: {}, rawBody: datadogAlert() })

    assert.equal(result.status, 'rejected')
    assert.equal(recentIntakeAudit().length, 0, 'an unauthenticated delivery must not reach the orchestrator')
  })
})

test('the audit buffer is bounded and never grows without limit', async () => {
  await withDatadogSource(async ({ getIncidentIntake, recentIntakeAudit, VENDOR_SECRET_HEADER }) => {
    const { runtime } = getIncidentIntake()
    for (let i = 0; i < 40; i += 1) {
      await runtime.deliver('datadog', { headers: { [VENDOR_SECRET_HEADER]: SECRET }, rawBody: datadogAlert({ id: `evt-${i}`, aggregation_key: `agg-${i}` }) })
    }
    assert.ok(recentIntakeAudit(500).length <= 200, 'the convenience buffer must stay bounded')
    assert.ok(recentIntakeAudit(10).length <= 10)
  })
})

test('a repeated alert is deduplicated and is not diagnosed twice', async () => {
  await withDatadogSource(async ({ getIncidentIntake, VENDOR_SECRET_HEADER }) => {
    const { runtime } = getIncidentIntake()
    const body = datadogAlert({ id: 'evt-fixed', aggregation_key: 'agg-fixed' })
    const headers = { [VENDOR_SECRET_HEADER]: SECRET }

    const first = await runtime.deliver('datadog', { headers, rawBody: body })
    const second = await runtime.deliver('datadog', { headers, rawBody: body })

    assert.equal(first.status, 'handled')
    assert.equal(second.status, 'duplicate', 'the second firing costs no diagnosis at all')
  })
})

test('WITHOUT a licence the alert is still received, but not diagnosed', async () => {
  // The commercial boundary, seen from the intake endpoint. An unlicensed deployment
  // must not quietly behave like a licensed one — but it must also not lose the
  // alert, because dropping a buyer's incident is a hostage tactic, not enforcement.
  const mod = await import('../self-healing-host/incident-intake.ts')
  const entitlement = await import('../self-healing-host/supervisor-entitlement.ts')
  const saved = { ...process.env }
  for (const key of Object.keys(process.env)) if (key.startsWith('SUPERVISOR_')) delete process.env[key]
  process.env.SUPERVISOR_INTAKE_SECRET_DATADOG = SECRET
  entitlement.resetSupervisorEntitlementForTests()
  mod.resetIncidentIntakeForTests()

  try {
    const { runtime } = mod.getIncidentIntake()
    const result = await runtime.deliver('datadog', { headers: { [mod.VENDOR_SECRET_HEADER]: SECRET }, rawBody: datadogAlert() })

    assert.equal(result.status, 'handled', 'the alert is still accepted and recorded')
    if (result.status !== 'handled') return
    assert.notEqual(result.record.status, 'completed')
    assert.ok(/licence|license/i.test(result.record.reason), `the record must say a licence is required: ${result.record.reason}`)
  } finally {
    mod.resetIncidentIntakeForTests()
    entitlement.resetSupervisorEntitlementForTests()
    for (const key of Object.keys(process.env)) if (key.startsWith('SUPERVISOR_')) delete process.env[key]
    Object.assign(process.env, saved)
  }
})
