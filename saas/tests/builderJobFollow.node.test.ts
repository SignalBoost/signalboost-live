// saas/tests/builderJobFollow.node.test.ts
//
// Production 2026-10-13: the Builder page showed "Failed to fetch" while job e246e15a was still running. One status
// check hit a network drop; the error escaped the page's wait loop and ended it. The page now follows the job through
// lost checks and stops only on a definite answer from the server.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { followBuilderJob, type BuilderJobCheck } from '../lib/builder/job-poll.ts'

type Reply = { status?: string; reply?: string; error?: string }
const running: BuilderJobCheck<Reply> = { status: 202, ok: true, data: { status: 'running', reply: 'COS Builder is running job e246e15a.' } }
const paused: BuilderJobCheck<Reply> = { status: 202, ok: true, data: { status: 'paused', reply: 'Builder saved its progress.' } }
const done: BuilderJobCheck<Reply> = { status: 200, ok: true, data: { status: 'succeeded', reply: 'Fixed and verified.' } }

function script(steps: ReadonlyArray<BuilderJobCheck<Reply> | 'network-drop' | BuilderJobCheck<Reply>['status']>) {
  let index = 0
  let clock = 0
  const active: string[] = []
  return {
    active,
    input: {
      check: async () => {
        const step = steps[Math.min(index++, steps.length - 1)]
        if (step === 'network-drop') throw new TypeError('Failed to fetch')
        if (typeof step === 'number') return { status: step, ok: false, data: { error: `HTTP ${step}` } }
        return step
      },
      onActive: (data: Reply) => { active.push(String(data.status)) },
      sleep: async (ms: number) => { clock += ms },
      now: () => clock,
    },
  }
}

test('a network drop mid-wait does not end the wait; the final result still arrives', async () => {
  const { input } = script([running, 'network-drop', running, done])
  const outcome = await followBuilderJob(input)
  assert.deepEqual(outcome, { kind: 'terminal', data: done.data })
})

test('temporary server errors are retried; a paused job is followed until it finishes', async () => {
  const { input, active } = script([running, 502, 503, paused, paused, running, done])
  const outcome = await followBuilderJob(input)
  assert.equal(outcome.kind, 'terminal')
  assert.deepEqual(active, ['running', 'paused', 'paused', 'running'])
})

test('a job that runs longer than five minutes is still followed to its result', async () => {
  const steps = [...Array.from({ length: 450 }, () => running), done] // 15 minutes at 2s per check
  const outcome = await followBuilderJob(script(steps).input)
  assert.equal(outcome.kind, 'terminal')
})

test('a definite server rejection ends the wait as a failure', async () => {
  const { input } = script([running, { status: 404, ok: false, data: { error: 'Builder job not found.' } }])
  assert.deepEqual(await followBuilderJob(input), { kind: 'failed', error: 'Builder job not found.' })
})

test('a connection that never comes back ends as unreachable, never as a raw "Failed to fetch"', async () => {
  const outcome = await followBuilderJob(script(['network-drop']).input)
  assert.deepEqual(outcome, { kind: 'unreachable' })
})

test('the Builder page follows jobs through followBuilderJob and explains a lost connection', () => {
  const page = readFileSync(new URL('../app/dashboard/developer/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /followBuilderJob<BuilderReply>\(/)
  assert.match(page, /outcome\.kind === 'unreachable'/)
  assert.doesNotMatch(page, /BUILDER_JOB_POLL_ATTEMPTS/)
})
// end of saas/tests/builderJobFollow.node.test.ts (if this line is missing, the paste was cut short)
