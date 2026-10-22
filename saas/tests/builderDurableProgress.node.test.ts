import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('polling exposes saved progress, without replaying jobs or leaking raw test output', () => {
  const source = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
  const get = source.slice(source.indexOf('export async function GET'), source.indexOf('export async function POST'))
  // The progress fields live in builderProgressSnapshot (#4755); GET returns it for every running or paused job.
  assert.match(get, /progress: builderProgressSnapshot\(job\)/)
  const progress = source.slice(source.indexOf('export function builderProgressSnapshot'), source.indexOf('function runningReply'))
  assert.match(progress, /lastActivityAt: job\.updatedAt/)
  assert.match(progress, /filesWritten:[\s\S]*?job\.checkpoint\?\.workingFiles\?\.length/)
  assert.match(progress, /verificationPending === true/)
  assert.match(progress, /modelTimeoutDeferrals:/)
  assert.match(progress, /testsPassed:/)
  assert.match(progress, /testsFailed:/)
  // GET never replays POST work. Its only background action is resuming the caller's own paused checkpoint through
  // the scheduler's admission rule and the generation-fenced claim (tests/builderPollResume.node.test.ts).
  assert.doesNotMatch(get, /enqueueBuilderJob|enqueueSignalBoostRepositoryRepairJob/)
  assert.equal(get.split('after(async').length - 1, 1)
  // #4759: an observeOnly poll never resumes; every other poll keeps the same admission rule.
  assert.match(get, /if \((?:!observeOnly && )?builderPollMayResume\(job\) && !selfHealingCapacityJob\(job\) && await builderSoleResumableJob\(job\.id\)\) \{\s*after\(async \(\) => \{ await runBuilderJob\(job\.id, access\.userId\) \}\)/)
})
