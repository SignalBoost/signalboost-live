import test from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { SupabaseBuilderWorkspace } from '../lib/builder/workspace-supabase.ts'
import { verifiedJobRepairLesson, formatVerifiedLessonsForPrompt } from '../lib/builder/verified-lessons.ts'
import type { BuilderLoopResult, BuilderToolTrace } from '../lib/builder/contracts.ts'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

const run = (ok: boolean, command = 'node --test verify.js'): BuilderToolTrace => ({ round: 1, toolId: 'run', input: { command }, ok,
  ...(ok ? {} : { failureClass: 'test' as const }), output: { exitCode: ok ? 0 : 1, timedOut: false, stderr: ok ? '' : 'AssertionError: private error' } })
const change: BuilderToolTrace = { round: 2, toolId: 'edit_file', ok: true, input: { path: 'app.js', search: 'a-b', replace: 'a+b' } }
const result = (trace: readonly BuilderToolTrace[]): BuilderLoopResult => ({ ok: true, answer: 'UNTRUSTED MODEL SUMMARY', trace })
const valid = result([run(false), change, run(true)])

test('the inference loop receives matching history only after observing its own failure', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('project', 'app.js', 'module.exports = 1')
  const prompts: string[] = []
  const actions = [ { type: 'tool', toolId: 'run', input: { command: 'node app.js' } },
    { type: 'tool', toolId: 'edit_file', input: { path: 'app.js', search: '= 1', replace: '= 2' } },
    { type: 'tool', toolId: 'run', input: { command: 'node app.js' } } ]
  let runs = 0
  const ai = { async generate(input: { prompt: string }) { prompts.push(input.prompt); return JSON.stringify(actions.shift() || { type: 'answer', answer: 'Verified.' }) } }
  const runner = { async run() { return { exitCode: runs++ ? 0 : 1, stdout: '', stderr: runs === 1 ? 'AssertionError: wrong value' : '', timedOut: false } } }
  const completed = await new BuilderToolLoop(ai, workspace, runner).run({ objective: 'Fix app.js. Run: node app.js', workspaceId: 'project', priorLessons: [verifiedJobRepairLesson(valid)!] })
  assert.equal(completed.ok, true)
  assert.doesNotMatch(prompts[0], /PRIOR VERIFIED REPAIR HISTORY/)
  assert.ok(prompts.slice(1).some(prompt => /PRIOR VERIFIED REPAIR HISTORY/.test(prompt)))
  assert.ok(prompts.every(prompt => !/private error|UNTRUSTED MODEL SUMMARY/.test(prompt)))
})

test('project lessons require fresh fail/change/same-command proof and never retain model prose', () => {
  const lesson = verifiedJobRepairLesson(valid)!
  assert.equal(lesson.failureClass, 'test')
  assert.doesNotMatch(lesson.fixSummary, /UNTRUSTED/)
  for (const trace of [[run(false), run(true)], [change, run(false), run(true)],
    [run(false), change, run(true, 'node unrelated.js')], [run(false), change, run(true), change],
    [run(false), change, run(true), run(false)]]) assert.equal(verifiedJobRepairLesson(result(trace)), null)
  assert.equal(verifiedJobRepairLesson({ ok: false, error: 'paused', trace: valid.trace }), null)
  const timedOut = { ...run(false), output: { exitCode: 1, timedOut: true, stderr: 'timeout' } }
  assert.equal(verifiedJobRepairLesson(result([timedOut, change, run(true)])), null)
  assert.equal(formatVerifiedLessonsForPrompt([lesson], null), '')
  assert.equal(formatVerifiedLessonsForPrompt([lesson], 'dependency'), '')
  assert.match(formatVerifiedLessonsForPrompt([lesson], 'test'), /prior test repair/)
  assert.doesNotMatch(formatVerifiedLessonsForPrompt([lesson], 'test'), /private error|UNTRUSTED|verify.js/)
})

test('project signal retrieval sends exact tenant/workspace/runtime filters and selects no historical content', async () => {
  const db = createClient('https://test.supabase.co', 'test-key', { global: { fetch: async (input) => {
    const url = new URL(String(input))
    assert.equal(url.searchParams.get('user_id'), 'eq.user-a')
    assert.equal(url.searchParams.get('workspace_id'), 'eq.workspace-a')
    assert.equal(url.searchParams.get('runtime'), 'eq.node24-network-denied-ephemeral')
    assert.equal(url.searchParams.get('select'), 'failure_class,runtime')
    assert.equal(url.searchParams.get('limit'), '12')
    return Response.json([{ failure_class: 'test', runtime: 'node24-network-denied-ephemeral' },
      { failure_class: 'test', runtime: 'python3' }, { failure_class: 'INJECT', runtime: 'node24-network-denied-ephemeral' }])
  } } })
  const signals = await new SupabaseBuilderWorkspace(db, 'user-a').fetchProjectRepairSignals('workspace-a')
  assert.equal(signals.length, 1)
  assert.equal(signals[0].causeEvidence, '')
  assert.equal(signals[0].fixSummary, '')
})

for (const terminal of [true, false]) test(`lesson persistence ${terminal ? 'deduplicates by job ID' : 'refuses stale/nonterminal worker'}`, async () => {
  let writes = 0
  const db = createClient('https://test.supabase.co', 'test-key', { global: { fetch: async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/builder_jobs')) {
      for (const [key, value] of Object.entries({ id: 'job-a', user_id: 'user-a', workspace_id: 'workspace-a',
        claim_generation: '2', status: 'succeeded', job_kind: 'standard' })) assert.equal(url.searchParams.get(key), `eq.${value}`)
      return Response.json(terminal ? [{ id: 'job-a' }] : [])
    }
    writes++
    assert.equal(url.searchParams.get('on_conflict'), 'id')
    assert.match(new Headers(init?.headers).get('Prefer')!, /resolution=ignore-duplicates/)
    const row = JSON.parse(String(init?.body))
    assert.equal(row.id, 'job-a'); assert.equal(row.workspace_id, 'workspace-a'); assert.equal(row.user_id, 'user-a')
    return new Response(null, { status: 201 })
  } } })
  assert.equal(await new SupabaseBuilderWorkspace(db, 'user-a').recordJobRepairLesson('workspace-a', 'job-a', 2, valid), terminal)
  assert.equal(writes, terminal ? 1 : 0)
})
