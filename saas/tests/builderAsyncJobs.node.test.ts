import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')
const jobStore = readFileSync(new URL('../lib/builder/job-store.ts', import.meta.url), 'utf8')
const jobRunner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260831172000_builder_jobs_and_history_order.sql', import.meta.url), 'utf8')

test('POST creates a durable job, schedules work after the response, and returns 202', () => {
  assert.match(route, /import \{ after, NextResponse \} from 'next\/server'/)
  const enqueue = route.indexOf('await enqueueBuilderJob({')
  const schedule = route.indexOf('after(async () => {', enqueue)
  const accepted = route.indexOf("{ status: 202 }", schedule)
  assert.ok(enqueue >= 0)
  assert.ok(schedule > enqueue)
  assert.ok(accepted > schedule)
  assert.match(route, /await runBuilderJob\(jobId, access\.userId\)/)
  assert.doesNotMatch(route, /new BuilderToolLoop/)
  assert.doesNotMatch(route, /executeSignalBoostRepositoryRepair/)
})

test('GET polling is user-scoped and never executes the job', () => {
  assert.match(route, /url\.searchParams\.get\('jobId'\)/)
  assert.match(route, /getBuilderJobForUser\(jobId, access\.userId\)/)
  assert.match(route, /job\.status === 'queued' \|\| job\.status === 'running'/)
  assert.match(route, /\{ status: 202 \}/)
  const getStart = route.indexOf('export async function GET')
  const postStart = route.indexOf('export async function POST')
  const getBody = route.slice(getStart, postStart)
  assert.doesNotMatch(getBody, /runBuilderJob|BuilderToolLoop|runner\.run/)
})

test('the browser sends Builder POST once and polls read-only status', () => {
  assert.equal((boundary.match(/fetchImpl\('\/api\/builder',\s*\{/g) ?? []).length, 1)
  assert.match(boundary, /method: 'POST'/)
  assert.match(boundary, /`\/api\/builder\?jobId=\$\{encodeURIComponent\(jobId\)\}`/)
  assert.match(boundary, /method: 'GET'/)
  assert.match(boundary, /BUILDER_JOB_POLL_ATTEMPTS = 20/)
  assert.match(boundary, /BUILDER_JOB_POLL_DELAY_MS = 1_500/)
  assert.match(boundary, /BUILDER_HISTORY_POLL_ATTEMPTS = 11/)
  assert.match(boundary, /BUILDER_HISTORY_POLL_DELAY_MS = 2_500/)
  assert.doesNotMatch(boundary, /retry.*POST/i)
})

test('running and terminal History share one durable assistant message', () => {
  assert.match(migration, /create table if not exists public\.builder_jobs/)
  assert.match(migration, /history_message_id uuid references public\.assistant_messages/)
  assert.match(migration, /create or replace function public\.enqueue_builder_job/)
  assert.match(migration, /insert into public\.assistant_messages[\s\S]*'assistant'[\s\S]*'running'/)
  assert.match(migration, /create or replace function public\.finish_builder_job/)
  assert.match(migration, /update public\.assistant_messages[\s\S]*where id = v_history_message_id/)
  assert.match(migration, /revoke all on public\.builder_jobs from anon, authenticated/)
  assert.match(jobStore, /\.rpc\('enqueue_builder_job'/)
  assert.match(jobStore, /\.rpc\('claim_builder_job'/)
  assert.match(jobStore, /\.rpc\('finish_builder_job'/)
})

test('background execution is idempotently claimed and skips cognitive-skill retrieval', () => {
  assert.match(jobRunner, /job = await claimBuilderJob\(jobId, userId\)/)
  assert.match(jobRunner, /if \(!job\) return/)
  assert.match(jobRunner, /priorLessons: \[\]/)
  assert.match(jobRunner, /runDebugFileJob/)
  assert.match(jobRunner, /finishBuilderJob/)
})
