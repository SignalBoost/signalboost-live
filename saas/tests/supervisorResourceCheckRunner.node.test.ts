// saas/tests/supervisorResourceCheckRunner.node.test.ts
//
// Read-only execution.
//
// The tests that justify this file are the SSRF ones. An alert is attacker-influenced
// input; if any string in it can become a network address the runner dereferences,
// this portable stops being something a Fortune-500 buyer can put inside their
// perimeter. So the assertions are not "it refuses bad URLs" — they are "no fetch
// happened at all", because the design intent is that there is no code path from
// incident text to a network call.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createResourceCheckRunner,
  createHttpResourceCheck,
  createReadOnlyExecutor,
  ResourceCheckConfigError,
  READ_ONLY_ACTIONS,
  type ResourceCheck,
} from '../lib/supervisor/portable/resource-check-runner.ts'
import { createTriageThinker } from '../lib/supervisor/portable/triage-thinker.ts'
import { createReferenceVerifier } from '../lib/supervisor/portable/reference-verifier.ts'
import { SupervisorOrchestrator } from '../lib/supervisor/orchestrator.ts'
import { DefaultSupervisorPolicyEngine } from '../lib/supervisor/policy-engine.ts'
import type { RepairStep } from '../lib/supervisor/repair-plan-schema.ts'
import type { SupervisorIncident } from '../lib/supervisor/incident-schema.ts'

const NOW = new Date('2026-07-27T12:00:00.000Z')
const now = () => NOW

const step = (target: string, action: RepairStep['action'] = 'read'): RepairStep => ({
  stepId: 'triage-1',
  action,
  description: `Read ${target}`,
  protectedAction: false,
  parameters: { target, shape: 'availability' },
})

const check = (checkId: string, resource: string, outcome = { ok: true, summary: 'healthy' }): ResourceCheck => ({
  checkId,
  matches: candidate => candidate === resource,
  run: () => outcome,
})

const incident = (overrides: Partial<SupervisorIncident> = {}): SupervisorIncident => ({
  incidentId: 'incident-1',
  provider: 'datadog',
  environment: 'production',
  severity: 'critical',
  detectedAt: NOW.toISOString(),
  source: 'webhook',
  errorMessage: 'checkout endpoint unavailable, health check failing',
  evidence: [{ evidenceId: 'e1', type: 'alert', capturedAt: NOW.toISOString(), summary: '503' }],
  metadata: {},
  affectedResource: 'svc/checkout',
  ...overrides,
})

test('runs the registered check for a recognised resource', async () => {
  const runner = createResourceCheckRunner({ checks: [check('checkout-health', 'svc/checkout')] })
  const outcome = await runner(step('svc/checkout'))
  assert.equal(outcome.ok, true)
  assert.equal(outcome.summary, 'healthy')
})

test('an unrecognised resource is reported as uncheckable, not investigated', async () => {
  const runner = createResourceCheckRunner({ checks: [check('checkout-health', 'svc/checkout')] })
  const outcome = await runner(step('svc/something-else'))
  assert.equal(outcome.ok, false)
  assert.ok(outcome.summary.includes('no check is registered'))
})

test('NO NETWORK CALL can be reached from anything written in an alert', async () => {
  // The core security property. Every one of these is a target an SSRF attempt would
  // aim at, delivered exactly the way an alert would carry it. None may produce a
  // fetch, because the resource string is only ever a map key.
  let fetches = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (...args: unknown[]) => { fetches += 1; throw new Error(`unexpected fetch: ${String(args[0])}`) }) as unknown as typeof fetch

  try {
    const runner = createResourceCheckRunner({ checks: [check('only-known', 'svc/checkout')] })
    const hostile = [
      'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      'http://metadata.google.internal/computeMetadata/v1/',
      'http://localhost:6379',
      'http://127.0.0.1:8080/admin',
      'file:///etc/passwd',
      'https://internal-admin.corp.local/delete-everything',
      '//evil.example.com',
      'svc/checkout/../../../admin',
    ]
    for (const target of hostile) {
      const outcome = await runner(step(target))
      assert.equal(outcome.ok, false, target)
      assert.ok(outcome.summary.includes('no check is registered'), target)
    }
    assert.equal(fetches, 0, 'the runner must never dereference a target taken from an alert')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('a check whose matcher throws neither matches nor breaks the run', async () => {
  const exploding: ResourceCheck = { checkId: 'bad-matcher', matches: () => { throw new Error('bad regex') }, run: () => ({ ok: true, summary: 'never' }) }
  const runner = createResourceCheckRunner({ checks: [exploding, check('good', 'svc/checkout')] })
  assert.equal((await runner(step('svc/checkout'))).summary, 'healthy')
})

test('a hung check times out rather than blocking the orchestration', async () => {
  const hanging: ResourceCheck = { checkId: 'hangs', matches: () => true, run: () => new Promise(() => {}) }
  const runner = createResourceCheckRunner({ checks: [hanging], timeoutMs: 40 })
  const started = Date.now()
  const outcome = await runner(step('svc/checkout'))
  assert.ok(Date.now() - started < 2000)
  assert.equal(outcome.ok, false)
  assert.ok(outcome.summary.includes('timed out'))
})

test('misconfiguration is refused when the deployment is wired', () => {
  assert.throws(() => createResourceCheckRunner({ checks: [{ checkId: '', matches: () => true, run: () => ({ ok: true, summary: '' }) }] }), ResourceCheckConfigError)
  assert.throws(() => createResourceCheckRunner({ checks: [check('dup', 'a'), check('dup', 'b')] }), ResourceCheckConfigError)
  assert.throws(() => createHttpResourceCheck({ checkId: 'x', url: 'not-a-url', matches: () => true }), ResourceCheckConfigError)
  assert.throws(() => createHttpResourceCheck({ checkId: 'x', url: 'file:///etc/passwd', matches: () => true }), ResourceCheckConfigError)
})

test('the http check uses its configured url and refuses to follow redirects', async () => {
  // The URL is a constructor argument, so it comes from configuration. Redirects are
  // not followed: a configured URL that redirects is a route back to an address the
  // operator did not choose.
  let requested = ''
  let redirectMode = ''
  const httpCheck = createHttpResourceCheck({
    checkId: 'health',
    url: 'https://status.example.internal/health',
    matches: resource => resource.startsWith('svc/'),
    fetchImpl: (async (url: string, init: RequestInit) => {
      requested = String(url)
      redirectMode = String(init.redirect)
      return { status: 200, text: async () => 'ok' } as unknown as Response
    }) as unknown as typeof fetch,
  })

  const runner = createResourceCheckRunner({ checks: [httpCheck] })
  const outcome = await runner(step('svc/checkout'))

  assert.equal(requested, 'https://status.example.internal/health')
  assert.equal(redirectMode, 'manual')
  assert.equal(outcome.ok, true)
  assert.equal(outcome.data?.status, 200)
})

test('the http check reports an unexpected status as unhealthy rather than throwing', async () => {
  const httpCheck = createHttpResourceCheck({
    checkId: 'health',
    url: 'https://status.example.internal/health',
    matches: () => true,
    fetchImpl: (async () => ({ status: 503, text: async () => 'service unavailable' }) as unknown as Response) as unknown as typeof fetch,
  })
  const outcome = await createResourceCheckRunner({ checks: [httpCheck] })(step('svc/checkout'))
  assert.equal(outcome.ok, false)
  assert.equal(outcome.data?.status, 503)
})

test('the http check truncates a large response body', async () => {
  const httpCheck = createHttpResourceCheck({
    checkId: 'health',
    url: 'https://status.example.internal/health',
    matches: () => true,
    maxResponseBytes: 32,
    fetchImpl: (async () => ({ status: 200, text: async () => 'x'.repeat(5000) }) as unknown as Response) as unknown as typeof fetch,
  })
  const outcome = await createResourceCheckRunner({ checks: [httpCheck] })(step('svc/checkout'))
  assert.equal(outcome.data?.truncated, true)
  assert.ok(String(outcome.data?.bodyExcerpt).length < 100)
})

test('the executor REFUSES a non-read step even when it was approved', async () => {
  // Independent of the policy engine on purpose. This is the component holding real
  // access, so it refuses on its own; if the two ever disagree the safe one wins.
  let ran = 0
  const executor = createReadOnlyExecutor({ runner: () => { ran += 1; return { ok: true, summary: 'ok' } }, now })
  const plan = createTriageThinker({ now }).proposeRepairPlan(incident())
  const mutated = { ...plan, steps: [{ ...plan.steps[0], action: 'api_request' as const, description: 'Delete the deployment' }] }

  const result = await executor.execute({ incident: incident(), plan: mutated, policy: { outcome: 'approved', reason: 'forced', evaluatedAt: NOW.toISOString(), policyVersion: 'test', approvedStepIds: [mutated.steps[0].stepId] }, approvedStepIds: [mutated.steps[0].stepId], context: { executionId: 'x' } })

  assert.equal(result.status, 'failed')
  assert.ok(result.summary.startsWith('refused:'))
  assert.equal(ran, 0, 'a mutating step must never reach the runner')
  assert.deepEqual(result.executedStepIds, [])
})

test('only read, verify and stop are executable', () => {
  assert.deepEqual([...READ_ONLY_ACTIONS], ['read', 'verify', 'stop'])
  for (const action of ['api_request', 'navigate', 'click', 'fill', 'select', 'screenshot', 'request_approval']) {
    assert.ok(!(READ_ONLY_ACTIONS as readonly string[]).includes(action), action)
  }
})

test('a step that reports a problem still counts as executed', async () => {
  // The observation IS the deliverable. An unhealthy answer is a successful check.
  const executor = createReadOnlyExecutor({ runner: () => ({ ok: false, summary: 'still returning 503' }), now })
  const plan = createTriageThinker({ now }).proposeRepairPlan(incident())
  const ids = plan.steps.map(s => s.stepId)

  const result = await executor.execute({ incident: incident(), plan, policy: { outcome: 'approved', reason: 'ok', evaluatedAt: NOW.toISOString(), policyVersion: 'test', approvedStepIds: ids }, approvedStepIds: ids, context: { executionId: 'x' } })

  assert.equal(result.status, 'completed')
  assert.equal(result.executedStepIds.length, ids.length)
  assert.equal(result.metadata?.anyObservationUnhealthy, true)
  assert.ok(result.summary.includes('still returning 503'))
})

test('END TO END: an alert is diagnosed, executed read-only, and verified', async () => {
  // The complete loop with every real component: triage Thinker, shipped policy
  // engine, this executor over a registered check, and the reference verifier. This is
  // the first time the portable's own loop runs start to finish with nothing stubbed.
  const runner = createResourceCheckRunner({ checks: [check('checkout-health', 'svc/checkout', { ok: true, summary: 'observations recorded: 200 OK' })] })
  const orchestrator = new SupervisorOrchestrator({
    thinker: createTriageThinker({ now }),
    policyEngine: new DefaultSupervisorPolicyEngine(),
    executor: createReadOnlyExecutor({ runner, now }),
    verifier: createReferenceVerifier({ runner: () => ({ ok: true, summary: 'observations recorded' }), now }),
    audit: { write: () => {} },
    mode: 'passive',
    executionContext: { executionId: 'exec-full-loop' },
  })

  const outcome = await orchestrator.run(incident())

  assert.equal(outcome.status, 'completed')
  assert.equal(outcome.policy?.outcome, 'approved')
  assert.equal(outcome.execution?.status, 'completed')
  assert.equal(outcome.verification?.status, 'verified')
  assert.ok(Number(outcome.execution?.metadata?.observationsGathered) >= 2)
})

test('END TO END: an alert about a resource with no registered check ends honestly', async () => {
  // Nothing is configured for this resource, so the loop must not report success. It
  // executed, it observed that it could not observe, and it says so.
  const runner = createResourceCheckRunner({ checks: [check('checkout-health', 'svc/checkout')] })
  const orchestrator = new SupervisorOrchestrator({
    thinker: createTriageThinker({ now }),
    policyEngine: new DefaultSupervisorPolicyEngine(),
    executor: createReadOnlyExecutor({ runner, now }),
    verifier: createReferenceVerifier({ runner: () => ({ ok: false, summary: 'no observations to confirm' }), now }),
    audit: { write: () => {} },
    mode: 'passive',
    executionContext: { executionId: 'exec-unknown' },
  })

  const outcome = await orchestrator.run(incident({ affectedResource: 'svc/unmonitored' }))

  assert.notEqual(outcome.status, 'completed')
  assert.equal(outcome.execution?.metadata?.anyObservationUnhealthy, true)
  assert.ok(String(outcome.execution?.summary).includes('no check is registered'))
})
