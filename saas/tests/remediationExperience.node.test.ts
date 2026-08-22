import assert from 'node:assert/strict'
import test from 'node:test'
import { nativeRemediationClass, remediationExperiencePrompt, summarizeRemediationExperience } from '../self-healing-host/remediation-experience-pure.ts'

const match = { provider: 'signalboost-platform', environment: 'production', incidentClass: nativeRemediationClass({ source: 'cron', nativeProbe: 'api' }) }

test('only repeated clean objective outcomes become remediation suggestions', () => {
  const experience = summarizeRemediationExperience([
    { outcome_status: 'success', facts: { ...match, action: 'restart-worker' } },
    { outcome_status: 'success', facts: { ...match, action: 'restart-worker' } },
    { outcome_status: 'failure', facts: { ...match, action: 'rotate-key' } },
    { outcome_status: 'success', facts: { ...match, action: 'rotate-key' } },
    { outcome_status: 'success', facts: { ...match, action: 'unrelated-action', incidentClass: 'cron:storage' } },
  ], match)

  assert.deepEqual(experience, [{ action: 'restart-worker', successes: 2, failures: 0 }])
  assert.match(remediationExperiencePrompt(experience), /does not grant approval/)
})

test('native remediation classes are bounded and stable', () => {
  assert.equal(nativeRemediationClass({ source: 'cron', nativeProbe: 'api latency' }), 'cron:api_latency')
})
