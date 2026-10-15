// saas/tests/builderPersonJobsFirst.node.test.ts
//
// Production 2026-10-14 (OrderFlow job 57f9bd7b): the owner's build waited 319s in the capacity queue while the
// one-job-per-tick scheduler served jobs in age order; eight Self-Healing platform repairs were queued and one
// Self-Healing repair (062054f2) kept taking the GPU. A build a person is waiting for now goes before background
// Self-Healing work in both scheduler queues (paused continuations and the cooled-down capacity queue).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { builderPersonStarted, personStartedFirst } from '../lib/builder/job-store.ts'

const selfHealing = { selfHealingKey: 'k', selfHealingSource: 's', selfHealingUniversityDistillation: true, platformRepair: true }

test('Self-Healing jobs are recognised by their selfHealing metadata; owner repository repairs stay person-started', () => {
  assert.equal(builderPersonStarted({}), true)
  assert.equal(builderPersonStarted(null), true)
  assert.equal(builderPersonStarted({ builderCapacityDeferrals: 2 }), true)
  assert.equal(builderPersonStarted({ platformRepair: true }), true, 'an owner-requested repository repair is a person waiting')
  assert.equal(builderPersonStarted(selfHealing), false)
  assert.equal(builderPersonStarted({ selfHealingOwnedAudit: true }), false)
})

test('person-started jobs go first, each group keeping its age order', () => {
  const rows = [
    { id: 'sh-old', metadata: selfHealing },
    { id: 'person-old', metadata: {} },
    { id: 'sh-new', metadata: { selfHealingOwnedSite: true } },
    { id: 'person-new', metadata: { builderCapacityDeferrals: 1 } },
  ]
  assert.deepEqual(personStartedFirst(rows).map(row => row.id), ['person-old', 'person-new', 'sh-old', 'sh-new'])
})

test('both scheduler queues apply the order, and paused continuations look past three Self-Healing jobs', () => {
  const store = readFileSync(new URL('../lib/builder/job-store.ts', import.meta.url), 'utf8')
  const list = store.slice(store.indexOf('export async function listBuilderContinuations'))
  assert.match(list, /\.select\('id,user_id,metadata'\)/)
  assert.match(list, /\.limit\(30\)/)
  assert.match(list, /personStartedFirst\(data \|\| \[\]\)\.slice\(0, 3\)/)
  const cron = readFileSync(new URL('../app/api/cron/builder-continuations/route.ts', import.meta.url), 'utf8')
  const capacity = cron.slice(cron.indexOf('async function queuedCapacityRecovery'), cron.indexOf('async function queuedUnclaimedBuilderJob'))
  assert.match(capacity, /const due = personStartedFirst\(data \|\| \[\]\)\.find\(job =>/)
  assert.match(capacity, /now - deferredAt >= builderCapacityRetryDelayMs\(attempts\)/, 'cooldown unchanged')
})
// end of saas/tests/builderPersonJobsFirst.node.test.ts (if this line is missing, the paste was cut short)
