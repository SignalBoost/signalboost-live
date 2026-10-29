// saas/tests/builderPollResume.node.test.ts
//
// Production 2026-10-14 (OrderFlow job 4eb4a2e5): between work slices the paused job sat idle 112-148s waiting for the
// once-a-minute scheduler, while the owner's page polled its status every 2 seconds. The poll now resumes the caller's
// own paused checkpoint immediately, only when nothing is running and no other checkpoint waits, through the existing
// generation-fenced claim: concurrent polls can never start two jobs on the single model slot, and nothing is replayed.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { builderPollMayResume } from '../lib/builder/job-store.ts'
import { MAX_WORK_SLICES } from '../lib/builder/work-budget.ts'

const paused = { status: 'paused', jobKind: 'standard', checkpoint: { version: 1 }, claimGeneration: 5 } as unknown as Parameters<typeof builderPollMayResume>[0]

test('only a resumable paused checkpoint is resumed by a poll — the same set the scheduler picks', () => {
  assert.equal(builderPollMayResume(paused), true)
  assert.equal(builderPollMayResume({ ...paused, status: 'running' }), false, 'already running')
  assert.equal(builderPollMayResume({ ...paused, status: 'queued' }), false, 'capacity queue keeps its cooldown')
  assert.equal(builderPollMayResume({ ...paused, status: 'failed' }), false)
  assert.equal(builderPollMayResume({ ...paused, checkpoint: null }), false, 'nothing saved: nothing to resume')
  assert.equal(builderPollMayResume({ ...paused, claimGeneration: MAX_WORK_SLICES }), false, 'work ceiling holds')
  assert.equal(builderPollMayResume({ ...paused, jobKind: 'platform_repair' as never }), false)
  const store = readFileSync(new URL('../lib/builder/job-store.ts', import.meta.url), 'utf8')
  const scheduler = store.slice(store.indexOf('export async function listBuilderContinuations'), store.indexOf('export function builderPollMayResume'))
  assert.match(scheduler, /\.eq\('status', 'paused'\)\.eq\('job_kind', 'standard'\)\.not\('checkpoint', 'is', null\)\s*\.lt\('claim_generation', MAX_WORK_SLICES\)/)
})

test('a poll resumes only when nothing runs and no other checkpoint waits, so two polls can never start two jobs (Codex P1)', () => {
  const store = readFileSync(new URL('../lib/builder/job-store.ts', import.meta.url), 'utf8')
  const admission = store.slice(store.indexOf('export async function builderSoleResumableJob'))
  // The canonical COS task kind is intentionally excluded from Builder's execution queue.
  // Preserve the kind filter: an unrelated running COS turn must not block Builder.
  assert.ok(admission.includes(".eq('job_kind', 'standard').or('status.eq.running,and(status.eq.paused,checkpoint.not.is.null)').neq('id', jobId)"))
  assert.ok(admission.includes(".select('id', { count: 'exact', head: true })"))
  assert.match(admission, /return !error && count === 0/)
  assert.match(admission, /if \(!db\) return false/)
  assert.doesNotMatch(store, /builderNoRunningClaim/)
})

test('the poll resumes only the caller\'s own job, never Self-Healing work, through the fenced runner', () => {
  const route = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
  const get = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'))
  assert.ok(get.indexOf('getBuilderJobForUser(jobId, access.userId)') < get.indexOf('builderPollMayResume(job)'), 'job ownership is checked first')
  assert.match(get, /!selfHealingCapacityJob\(job\)/)
  const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  assert.match(runner, /job = await claimBuilderJob\(jobId, userId\)\s*\n\s*if \(!job\) return/, 'a second concurrent poll finds the claim taken and does nothing')
})
// end of saas/tests/builderPollResume.node.test.ts (if this line is missing, the paste was cut short)
