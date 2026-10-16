// Bounded exhaustive state-space exploration of customer LAB job submission.
// This is model-based fault enumeration, NOT whole-program symbolic execution.
// No network, customer credentials, database mutation or paid provider calls.
import assert from 'node:assert/strict'
import test from 'node:test'
import { runReservedJob, type JobOutcome, type PlannedJob } from '../lib/ai/cos/labCustomerTraining.ts'

type Scenario = Readonly<{
  reserveFails: boolean
  submitFails: boolean
  lookup: 'found' | 'none' | 'unavailable'
  attachFails: boolean
  releaseFails: boolean
}>
const values = <T>(items: readonly T[]) => items
const scenarios: Scenario[] = []
for (const reserveFails of values([false, true]))
for (const submitFails of values([false, true]))
for (const lookup of values(['found', 'none', 'unavailable'] as const))
for (const attachFails of values([false, true]))
for (const releaseFails of values([false, true]))
  scenarios.push({ reserveFails, submitFails, lookup, attachFails, releaseFails })

test('all 48 LAB submission fault combinations preserve reservation, identity and recovery invariants', async () => {
  assert.equal(scenarios.length, 48)
  for (const scenario of scenarios) {
    const events: string[] = []
    const job = { jobId: 'provider-job-1', jobUrl: 'https://provider.example/jobs/1' }
    const plan = { namespace: 'customer-namespace', jobName: 'itmounts-job-run123', spec: {} } as PlannedJob
    const ports = {
      resolveNamespace: async () => 'customer-namespace',
      submit: async (namespace: string, token: string) => {
        events.push('submit')
        assert.equal(namespace, plan.namespace)
        assert.equal(token, 'customer-token')
        if (scenario.submitFails) throw new Error('transport_failure')
        return job
      },
      findByName: async (namespace: string, token: string, name: string) => {
        events.push('reconcile')
        assert.equal(namespace, plan.namespace)
        assert.equal(token, 'customer-token')
        assert.equal(name, plan.jobName)
        if (scenario.lookup === 'unavailable') throw new Error('lookup_unavailable')
        return scenario.lookup === 'found' ? job : null
      },
    }
    const book = {
      reserve: async () => {
        events.push('reserve')
        if (scenario.reserveFails) throw new Error('reservation_failed')
      },
      attach: async (value: typeof job) => {
        events.push('attach')
        assert.deepEqual(value, job)
        if (scenario.attachFails) throw new Error('attach_failed')
      },
      release: async () => {
        events.push('release')
        if (scenario.releaseFails) throw new Error('release_failed')
      },
    }
    let outcome: JobOutcome | null = null
    let reservationRejected = false
    try { outcome = await runReservedJob({ plan, customerHfToken: 'customer-token', ports, book }) }
    catch (e) {
      assert.match(String(e), /reservation_failed/)
      reservationRejected = true
    }
    const description = JSON.stringify(scenario)
    assert.equal(events[0], 'reserve', description)
    if (scenario.reserveFails) {
      assert.equal(reservationRejected, true, description)
      assert.deepEqual(events, ['reserve'], description)
      continue
    }
    assert.equal(reservationRejected, false, description)
    assert.equal(events[1], 'submit', description)
    assert.ok(outcome, description)
    if (!scenario.submitFails) {
      assert.equal(outcome.status, scenario.attachFails ? 'submitted_unattached' : 'submitted', description)
      assert.deepEqual(events, ['reserve', 'submit', 'attach'], description)
    } else if (scenario.lookup === 'unavailable') {
      assert.equal(outcome.status, 'unknown', description)
      assert.deepEqual(events, ['reserve', 'submit', 'reconcile'], description)
    } else if (scenario.lookup === 'none') {
      assert.equal(outcome.status, 'not_submitted', description)
      assert.deepEqual(events, ['reserve', 'submit', 'reconcile', 'release'], description)
    } else {
      assert.equal(outcome.status, scenario.attachFails ? 'submitted_unattached' : 'submitted', description)
      assert.deepEqual(events, ['reserve', 'submit', 'reconcile', 'attach'], description)
    }
    // Never release a reservation unless the provider lookup PROVES no job exists.
    if (events.includes('release')) assert.equal(scenario.submitFails && scenario.lookup === 'none', true, description)
    // Once provider work may exist, retain reconciliation state even if attachment fails.
    if (outcome.status === 'unknown' || outcome.status === 'submitted_unattached')
      assert.ok(!events.includes('release'), description)
  }
})
