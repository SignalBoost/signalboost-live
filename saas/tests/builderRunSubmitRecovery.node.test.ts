// saas/tests/builderRunSubmitRecovery.node.test.ts
//
// Production 2026-10-21: "Run Builder" showed the browser's raw "Failed to fetch" — the POST got no answer and the
// page stopped without knowing whether the job had been queued. The page now names the job before sending it; a lost
// answer is resolved by asking about that job, and a resend under the same name can never create a second job.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { submitBuilderRun, type BuilderJobCheck } from '../lib/builder/job-poll.ts'

type Data = { jobId?: string; status?: string; error?: string }

// A server with the same idempotency rule as POST /api/builder: one job per requested id.
function fakeServer(script: { dropPosts?: Array<'before' | 'after'>; failChecks?: number }) {
  const jobs = new Map<string, string>()
  const drops = [...(script.dropPosts ?? [])]
  let failChecks = script.failChecks ?? 0
  let created = 0
  const id = '11111111-1111-4111-8111-111111111111'
  return {
    jobs, created: () => created,
    post: async (): Promise<BuilderJobCheck<Data>> => {
      const drop = drops.shift()
      if (drop === 'before') throw new TypeError('Failed to fetch')
      if (!jobs.has(id)) { jobs.set(id, 'queued'); created += 1 }
      if (drop === 'after') throw new TypeError('Failed to fetch')
      return { status: 202, ok: true, data: { jobId: id, status: jobs.get(id) } }
    },
    check: async (): Promise<BuilderJobCheck<Data>> => {
      if (failChecks > 0) { failChecks -= 1; throw new TypeError('Failed to fetch') }
      const status = jobs.get(id)
      return status
        ? { status: 202, ok: true, data: { jobId: id, status } }
        : { status: 404, ok: false, data: { error: 'Builder job not found.' } }
    },
  }
}
const sleep = async () => {}

test('an answered request is returned unchanged', async () => {
  const server = fakeServer({})
  const outcome = await submitBuilderRun({ post: server.post, check: server.check, sleep })
  assert.equal(outcome.kind, 'answered')
  assert.equal(server.created(), 1)
})

test('answer lost AFTER the server queued the job: the page follows that job, nothing is sent twice', async () => {
  const server = fakeServer({ dropPosts: ['after'] })
  const outcome = await submitBuilderRun({ post: server.post, check: server.check, sleep })
  assert.equal(outcome.kind, 'accepted')
  assert.equal(server.created(), 1)
})

test('request lost BEFORE it reached the server: it is sent again and creates exactly one job', async () => {
  const server = fakeServer({ dropPosts: ['before'] })
  const outcome = await submitBuilderRun({ post: server.post, check: server.check, sleep })
  assert.equal(outcome.kind, 'answered')
  assert.equal(server.created(), 1)
})

test('repeated drops plus failing checks still end with one job', async () => {
  const server = fakeServer({ dropPosts: ['before', 'after'], failChecks: 3 })
  const outcome = await submitBuilderRun({ post: server.post, check: server.check, sleep })
  assert.equal(outcome.kind, 'accepted')
  assert.equal(server.created(), 1)
})

test('a dead connection ends as unreachable, never as a thrown "Failed to fetch"', async () => {
  const fail = async (): Promise<BuilderJobCheck<Data>> => { throw new TypeError('Failed to fetch') }
  const outcome = await submitBuilderRun({ post: fail, check: fail, sleep, maxUnansweredChecks: 5 })
  assert.deepEqual(outcome, { kind: 'unreachable' })
})

test('Run Builder names the job and recovers through submitBuilderRun', () => {
  const page = readFileSync(new URL('../app/dashboard/developer/page.tsx', import.meta.url), 'utf8')
  const run = page.slice(page.indexOf('async function run()'), page.indexOf('async function stopCurrentJob'))
  assert.match(run, /const requestJobId = crypto\.randomUUID\(\)/)
  assert.match(run, /jobId: requestJobId/)
  assert.match(run, /submitBuilderRun<BuilderReply>\(/)
  assert.doesNotMatch(run, /const response = await fetch\('\/api\/builder', \{\s*method: 'POST'[\s\S]*?\}\)\s*let data = await response\.json/)
  for (const lang of ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar']) {
    assert.match(page.slice(page.indexOf('unreachable: {')), new RegExp(`\\b${lang}: '[^']*\\{id\\}`), `${lang} unreachable copy`)
  }
})

test('POST /api/builder returns the existing job for a resent job id and lets the primary key decide races', () => {
  const route = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
  const post = route.slice(route.indexOf('export async function POST'), route.indexOf('export async function DELETE'))
  const early = post.indexOf('const existing = await getBuilderJobForUser(requestedJobId, access.userId)')
  assert.ok(early > 0, 'resent id is looked up')
  assert.ok(early < post.indexOf('selectBuilderProject('), 'before any workspace or job side effect')
  assert.match(post, /const jobId = requestedJobId \|\| crypto\.randomUUID\(\)/)
  assert.equal((post.match(/return requestedJobReply\(await requestedJobOrThrow\(requestedJobId, access\.userId, error\)\)/g) || []).length, 3, 'every enqueue path')
  assert.match(route, /async function requestedJobOrThrow[\s\S]*?getBuilderJobForUser\(requestedJobId, userId\)[\s\S]*?throw error/)
  const repair = readFileSync(new URL('../lib/builder/repository-repair-job.ts', import.meta.url), 'utf8')
  assert.match(repair, /const jobId = input\.jobId \|\| crypto\.randomUUID\(\)/)
})
