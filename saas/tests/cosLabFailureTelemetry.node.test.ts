import assert from 'node:assert/strict'
import { test } from 'node:test'
import { composeLabFailureTelemetry } from '../lib/ai/cos/cosLabFailureTelemetry.ts'

const since = '2026-10-07T00:00:00.000Z'

test('counts only signed-verdict classifications bound to terminal failed provider jobs', () => {
  const telemetry = composeLabFailureTelemetry({
    since,
    providerJobs: [
      { job_id: 'a', provider_stage: 'ERROR' },
      { job_id: 'b', provider_stage: 'CANCELED' },
      { job_id: 'c', provider_stage: 'DELETED' },
      { job_id: 'ok', provider_stage: 'COMPLETED' },
    ],
    verdictEvents: [
      { evidence: { jobId: 'a', classification: 'PLATFORM_FAILURE' } },
      { evidence: { jobId: 'b', classification: 'CUSTOMER_INFRA_FAILURE' } },
      { evidence: { jobId: 'ok', classification: 'COMPETENCY_FAILURE' } },
      { evidence: { jobId: 'unknown', classification: 'COMPETENCY_FAILURE' } },
      { evidence: { jobId: 'c', classification: 'made_up' } },
    ],
  })

  assert.equal(telemetry.available, true)
  assert.equal(telemetry.terminalFailures, 3)
  assert.equal(telemetry.classified, 2)
  assert.equal(telemetry.unclassified, 1)
  assert.equal(telemetry.classificationCoverage, 0.6667)
  assert.equal(telemetry.platformFailures, 1)
  assert.equal(telemetry.customerInfraFailures, 1)
  assert.equal(telemetry.competencyFailures, 0)
  assert.deepEqual(telemetry.byProviderStage, { ERROR: 1, CANCELED: 1, DELETED: 1 })
})

test('does not double-count competing duplicate evidence and reports null coverage with no terminal failures', () => {
  const telemetry = composeLabFailureTelemetry({
    since,
    providerJobs: [{ job_id: 'ok', provider_stage: 'COMPLETED' }],
    verdictEvents: [
      { evidence: { jobId: 'ok', classification: 'PLATFORM_FAILURE' } },
      { evidence: { jobId: 'ok', classification: 'CUSTOMER_INFRA_FAILURE' } },
    ],
  })
  assert.equal(telemetry.terminalFailures, 0)
  assert.equal(telemetry.classified, 0)
  assert.equal(telemetry.classificationCoverage, null)
})

test('first valid verdict per job wins defensively if corrupt duplicate rows exist', () => {
  const telemetry = composeLabFailureTelemetry({
    since,
    providerJobs: [{ job_id: 'a', provider_stage: 'ERROR' }],
    verdictEvents: [
      { evidence: { jobId: 'a', classification: 'COMPETENCY_FAILURE' } },
      { evidence: { jobId: 'a', classification: 'PLATFORM_FAILURE' } },
    ],
  })
  assert.equal(telemetry.classified, 1)
  assert.equal(telemetry.competencyFailures, 1)
  assert.equal(telemetry.platformFailures, 0)
})
