import test from 'node:test'
import assert from 'node:assert/strict'
import { createInMemoryRemediationMemoryStore, recordRemediationExperience, recommendRemedy } from '../lib/supervisor/remediation-memory.ts'

test('only verified successful remedies become recommendation-eligible after repeated evidence', async () => {
  const store = createInMemoryRemediationMemoryStore()
  for (let index = 1; index <= 3; index++) await recordRemediationExperience(store, { incidentKey: 'tenant:prod:queue', remedyId: 'restart-worker', verified: true, succeeded: true, recordedAt: index })
  const recommendation = await recommendRemedy(store, 'tenant:prod:queue', 'restart-worker')
  assert.equal(recommendation?.verifiedSuccesses, 3)
  assert.equal(recommendation?.recommendationEligible, true)
})

test('unverified outcomes do not teach COS and verified failure withdraws the recommendation', async () => {
  const store = createInMemoryRemediationMemoryStore()
  await recordRemediationExperience(store, { incidentKey: 'i', remedyId: 'r', verified: false, succeeded: true, recordedAt: 1 })
  assert.equal(await recommendRemedy(store, 'i', 'r'), null)
  for (let index = 1; index <= 3; index++) await recordRemediationExperience(store, { incidentKey: 'i', remedyId: 'r', verified: true, succeeded: true, recordedAt: index })
  await recordRemediationExperience(store, { incidentKey: 'i', remedyId: 'r', verified: true, succeeded: false, recordedAt: 4 })
  assert.equal(await recommendRemedy(store, 'i', 'r'), null)
})

test('durable stores can atomically record a verified outcome', async () => {
  let readOrWriteCalled = false
  const store = {
    get: () => { readOrWriteCalled = true; throw new Error('atomic path should not read') },
    set: () => { readOrWriteCalled = true; throw new Error('atomic path should not write') },
    recordExperience: async () => Object.freeze({ incidentKey: 'i', remedyId: 'r', verifiedSuccesses: 3, verifiedFailures: 0, consecutiveFailures: 0, recommendationEligible: true, updatedAt: 9 }),
  }
  const record = await recordRemediationExperience(store, { incidentKey: 'i', remedyId: 'r', verified: true, succeeded: true, recordedAt: 9 })
  assert.equal(record?.recommendationEligible, true)
  assert.equal(readOrWriteCalled, false)
})
