import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { verifiedBuilderCognitiveApplication } from '../lib/builder/cognitive-application.ts'

const route = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
const historyRoute = readFileSync(new URL('../app/api/assistant/chats/route.ts', import.meta.url), 'utf8')
const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')
const jobStore = readFileSync(new URL('../lib/builder/job-store.ts', import.meta.url), 'utf8')
const jobRunner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
const repositoryRepair = readFileSync(new URL('../lib/builder/repository-repair.ts', import.meta.url), 'utf8')
const cognitiveSkillContext = readFileSync(new URL('../lib/ai/cos/cognitiveSkillContext.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260831174502_builder_jobs_and_history_order.sql', import.meta.url), 'utf8')
const staleRecoveryMigration = readFileSync(new URL('../supabase/migrations/20260831180318_builder_job_stale_recovery.sql', import.meta.url), 'utf8')

test('cognitive application requires a workspace change and successful host verification', () => {
  const change = { round: 1, toolId: 'edit_file' as const, input: {}, ok: true }
  const pass = { round: 2, toolId: 'run' as const, input: { command: 'npm test' }, ok: true, output: { exitCode: 0 } }
  const earlyPass = { ...pass, round: 0 }
  assert.equal(verifiedBuilderCognitiveApplication({ ok: true, answer: 'done', trace: [change, pass] }), true)
  assert.equal(verifiedBuilderCognitiveApplication({ ok: true, answer: 'done', trace: [pass] }), false)
  assert.equal(verifiedBuilderCognitiveApplication({ ok: true, answer: 'done', trace: [earlyPass, change] }), false)
  assert.equal(verifiedBuilderCognitiveApplication({ ok: false, error: 'failed', trace: [change, pass] }), false)
})

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
  assert.match(route, /enqueueSignalBoostRepositoryRepairJob/)
  assert.match(jobRunner, /executeSignalBoostRepositoryRepair/)
})

test('small attached repairs retain the debug protocol and project repairs use the verified loop', () => {
  assert.match(route, /const debugPlan = planDebugFileJob\(objective, files\)/)
  assert.match(route, /debugPaths: debugPlan\.files/)
  assert.match(route, /jobKind: debugPlan \? 'debug_file' : 'standard'/)
  assert.match(jobRunner, /runDebugFileJob/)
  assert.match(jobRunner, /new BuilderToolLoop/)
})

test('the server repeats strict coding classification before workspace creation or enqueue', () => {
  assert.match(route, /import \{ isConciergeBuilderObjective \} from '@\/lib\/ai\/cos\/cosReasoningRolePolicy'/)
  assert.match(route, /const routingContext = \{ attachmentNames: files\.map\(file => file\.path\) \}/)
  assert.match(route, /!isConciergeBuilderObjective\(objective, routingContext\)/)
  assert.match(route, /builder_objective_not_coding/)
  assert.match(route, /No Builder job was created and no code was run/)

  const strictGate = route.indexOf('!isConciergeBuilderObjective(objective, routingContext)')
  const nonCoding = route.indexOf("error: 'builder_objective_not_coding'", strictGate)
  const workspace = route.indexOf('createSupabaseBuilderWorkspace(access.userId)', nonCoding)
  const enqueue = route.indexOf('await enqueueBuilderJob({', workspace)
  assert.ok(strictGate >= 0)
  assert.ok(nonCoding > strictGate)
  assert.ok(workspace > nonCoding, 'non-coding requests must be rejected before workspace creation')
  assert.ok(enqueue > workspace, 'non-coding requests must be rejected before job enqueue')
})

test('GET polling is user-scoped and never executes the job', () => {
  assert.match(route, /url\.searchParams\.get\('jobId'\)/)
  assert.match(route, /getBuilderJobForUser\(jobId, access\.userId\)/)
  assert.match(route, /job\.status === 'queued' \|\| job\.status === 'running'/)
  assert.match(route, /\{ status: 202 \}/)
  const getStart = route.indexOf('export async function GET')
  const postStart = route.indexOf('export async function POST')
  const getBody = route.slice(getStart, postStart)
  assert.doesNotMatch(getBody, /BuilderToolLoop|runner\.run|enqueueBuilderJob/)
  // The one exception: the caller's own paused checkpoint resumes through the fenced runner under the scheduler's
  // admission rule (tests/builderPollResume.node.test.ts). Nothing new is created or replayed.
  assert.equal(getBody.split('runBuilderJob(').length - 1, 1)
  assert.match(getBody, /builderPollMayResume\(job\) && !selfHealingCapacityJob\(job\) && await builderSoleResumableJob\(job\.id\)[\s\S]{0,80}runBuilderJob\(job\.id, access\.userId\)/)
})

test('the browser sends Builder POST once and polls read-only status', () => {
  assert.equal((boundary.match(/fetchImpl\('\/api\/builder',\s*\{/g) ?? []).length, 1)
  assert.match(boundary, /method: 'POST'/)
  assert.match(boundary, /`\/api\/builder\?jobId=\$\{encodeURIComponent\(jobId\)\}`/)
  assert.match(boundary, /method: 'GET'/)
  assert.match(boundary, /BUILDER_JOB_POLL_ATTEMPTS = 240/)
  assert.match(boundary, /BUILDER_JOB_POLL_DELAY_MS = 2_000/)
  assert.match(boundary, /BUILDER_HISTORY_POLL_ATTEMPTS = 11/)
  assert.match(boundary, /BUILDER_HISTORY_POLL_DELAY_MS = 2_500/)
  assert.doesNotMatch(boundary, /retry.*POST/i)
})

test('deliberate Stop aborts page polling but does not cancel or replay the durable job', () => {
  assert.match(boundary, /function deliberateAbort\(error: unknown, signal\?: AbortSignal\)/)
  assert.match(boundary, /signal\?\.aborted === true/)
  assert.doesNotMatch(boundary, /const terminal = await pollBuilderJob\(/)
  assert.doesNotMatch(boundary, /pollBuilderJob\(fetchImpl, jobId, signal\)/)
  assert.match(boundary, /signal,\n\s*\}\)/)
  assert.match(boundary, /if \(deliberateAbort\(error, signal\)\) throw error/)
  assert.match(boundary, /new DOMException\('The operation was aborted\.', 'AbortError'\)/)
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
  assert.match(jobStore, /\.rpc\('claim_builder_job_slice'/)
  assert.match(jobStore, /\.rpc\('finish_builder_job_slice'/)
})

test('expired background workers become terminal in both polling and History', () => {
  assert.match(jobStore, /BUILDER_JOB_STALE_AFTER_MS = 6 \* 60 \* 1000/)
  assert.match(jobStore, /\.rpc\('expire_stale_builder_jobs'/)
  assert.match(jobStore, /await reconcileStaleBuilderJobs\(\{ userId, jobId \}\)/)
  assert.match(historyRoute, /await reconcileBuilderHistory\(userId, id\)/)
  assert.match(staleRecoveryMigration, /updated_at <= p_cutoff/)
  assert.match(staleRecoveryMigration, /for update skip locked/)
  assert.match(staleRecoveryMigration, /status = 'failed'/)
  assert.match(staleRecoveryMigration, /update public\.assistant_messages/)
  assert.match(staleRecoveryMigration, /No Builder POST was replayed/)
  assert.match(staleRecoveryMigration, /revoke all on function public\.expire_stale_builder_jobs/)
  assert.match(staleRecoveryMigration, /grant execute on function public\.expire_stale_builder_jobs[\s\S]*service_role/)
})

test('background execution is idempotently claimed and applies only validated software skills with verified outcomes', () => {
  assert.match(jobRunner, /job = await claimBuilderJob\(jobId, userId\)/)
  assert.match(jobRunner, /if \(!job\) return/)
  assert.match(jobRunner, /fetchProjectRepairSignals\(job.workspaceId\)/)
  assert.match(jobRunner, /retrieveValidatedCognitiveSkills\(job\.objective, \{ specialistFamily: 'software' \}\)/)
  assert.match(cognitiveSkillContext, /query\.contains\('metadata', \{ specialistFamily: options\.specialistFamily \}\)/)
  assert.match(jobRunner, /verifiedBuilderCognitiveApplication\(result\)/)
  assert.match(jobRunner, /recordVerifiedCognitiveProductionOutcome/)
  assert.match(repositoryRepair, /cognitiveSkills: cognitive\.items/)
  assert.match(repositoryRepair, /cos_software_specialist_platform_engineer/)
  assert.match(jobRunner, /runDebugFileJob/)
  assert.match(jobRunner, /finishBuilderJob/)
})

test('repeated write_file(src/storage.js) is acknowledged as idempotent instead of trapping the agent', async () => {
  const { InMemoryBuilderWorkspace } = await import('../lib/builder/workspace.ts')
  const { BuilderToolLoop } = await import('../lib/builder/tool-loop.ts')
  const workspace = new InMemoryBuilderWorkspace()
  const source = "module.exports = { save: () => true }"
  const workspaceId = 'user:repeat-storage-write-regression'
  let calls = 0
  let runs = 0
  const ai = { async generate() {
    calls++
    if (calls <= 3) return JSON.stringify({
      type: 'tool', toolId: 'write_file', input: { path: 'src/storage.js', content: source },
    })
    return JSON.stringify({ type: 'tool', toolId: 'run', input: { command: 'node src/storage.js' } })
  } }
  const runner = { async run() { runs++; return { exitCode: 0, stdout: 'ok', stderr: '', timedOut: false } } }
  const result = await new BuilderToolLoop(ai, workspace, runner).run({
    objective: 'Create src/storage.js and run: node src/storage.js',
    workspaceId, maxRounds: 8,
  })
  assert.equal((await workspace.readFile(workspaceId, 'src/storage.js'))?.content, source)
  assert.ok(result.trace.some(item =>
    item.toolId === 'write_file' && item.ok && (item.output as { alreadyPresent?: boolean } | undefined)?.alreadyPresent === true),
    'identical writes must be acknowledged without mutating the workspace')
  assert.equal(runs, 1, 'the Builder must execute host verification after repeated identical writes')
  assert.ok(result.trace.some(item => item.toolId === 'run' && item.ok),
    'verification must be recorded in the durable trace')
  assert.notEqual('error' in result ? result.error : '', 'builder_stalled_repeated_inspection')
})

test('anti-loop guard compares repeated writes to current content and counts repeats independently of listing', () => {
  const source = readFileSync(new URL('../lib/builder/tool-loop.ts', import.meta.url), 'utf8')
  assert.match(source, /existing\.content === proposed/)
  assert.match(source, /alreadyPresent: true/)
  assert.match(source, /builder_write_content_differs:/)
  assert.match(source, /builder_repeated_write_blocked:/)
  assert.match(source, /meaningfulActions = \[\.\.\.trace\]\.reverse\(\)\.filter\(/)
})

test('allowed identical writes do not consume the mutation budget or reset verification', () => {
  const source = readFileSync(new URL('../lib/builder/tool-loop.ts', import.meta.url), 'utf8')
  assert.match(source, /existingFile\.content === proposedContent/)
  assert.match(source, /alreadyPresent: true/)
  assert.match(source, /writeCount \+= 1/)
  assert.match(source, /alreadyPresent !== true/)
})

test('stale targeted edit recovery rereads current file with bounded retries', () => {
  const source = readFileSync(new URL('../lib/builder/tool-loop.ts', import.meta.url), 'utf8')
  assert.match(source, /message === 'builder_edit_target_not_found'/)
  assert.match(source, /builder_edit_target_recovery_exhausted/)
  assert.match(source, /await this\.workspace\.readFile\(input\.workspaceId, path\)/)
})
