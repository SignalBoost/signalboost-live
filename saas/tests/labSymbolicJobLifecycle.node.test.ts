import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runReservedJob, type PlannedJob } from '../lib/ai/cos/labCustomerTraining.ts'

type Case = {
  reserveFailure: boolean; submitFailure: boolean
  lookup: 'absent' | 'found' | 'error'
  attachFailure: boolean; releaseFailure: boolean
  expectedStatus: string; expectedEvents: string[]
}
const file = process.env.LAB_Z3_JOBS_FILE
test('Z3 model replay: all 48 real customer LAB reservation and recovery paths', { skip: !file && 'requires solver output' }, async () => {
  const data = JSON.parse(readFileSync(file!, 'utf8')) as { schema: string; cases: Case[] }
  assert.equal(data.schema, 'itmounts.lab.z3.job_lifecycle.v1')
  assert.equal(data.cases.length, 48)
  for (const c of data.cases) {
    const events: string[] = []
    const job = { jobId: 'job-123', jobUrl: 'https://example.test/jobs/job-123' }
    const plan = { namespace: 'customer', jobName: 'lab-unique-job', spec: {} } as PlannedJob
    const ports = {
      resolveNamespace: async () => 'customer',
      submit: async (namespace: string, token: string) => {
        events.push('submit')
        assert.equal(namespace, 'customer')
        assert.equal(token, 'customer-key')
        if (c.submitFailure) throw new Error('submit_transport_failed')
        return job
      },
      findByName: async (namespace: string, token: string, name: string) => {
        events.push('lookup')
        assert.equal(namespace, 'customer')
        assert.equal(token, 'customer-key')
        assert.equal(name, 'lab-unique-job')
        if (c.lookup === 'error') throw new Error('lookup_unavailable')
        return c.lookup === 'found' ? job : null
      },
    }
    const book = {
      reserve: async () => { events.push('reserve'); if (c.reserveFailure) throw new Error('reservation_failed') },
      attach: async (value: typeof job) => {
        events.push('attach')
        assert.deepEqual(value, job)
        if (c.attachFailure) throw new Error('attach_failed')
      },
      release: async () => { events.push('release'); if (c.releaseFailure) throw new Error('release_failed') },
    }
    let status = ''
    try {
      const outcome = await runReservedJob({ plan, customerHfToken: 'customer-key', ports, book })
      status = outcome.status
      if (outcome.status === 'submitted') {
        assert.equal(outcome.jobId, job.jobId)
        assert.equal(outcome.recoveredByName, c.submitFailure && c.lookup === 'found')
      }
    } catch (error) {
      assert.match(String(error), /reservation_failed/)
      status = 'reservation_failed'
    }
    assert.equal(status, c.expectedStatus, JSON.stringify(c))
    assert.deepEqual(events, c.expectedEvents, JSON.stringify(c))
    if (status === 'unknown' || status === 'submitted_unattached') {
      assert.ok(!events.includes('release'), JSON.stringify(c))
    }
    if (events.includes('release')) {
      assert.equal(c.submitFailure && c.lookup === 'absent', true, JSON.stringify(c))
    }
  }
})
