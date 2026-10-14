// saas/tests/builderModelBusyWaits.node.test.ts
//
// Production 2026-10-13 (workspace b756499e): the owner's OrderFlow build wrote package.json and src/errors.js, then
// ended permanently with builder_runpod_primary_busy because another job held the single model slot. Self-Healing jobs
// were queued against the same GPU and only they were ever retried. A busy model is now a wait for every durable job:
// the round is retried, and if the work slice ends first the job saves its progress and resumes. A Builder job a person
// started also marks live demand so background Self-Healing work yields the GPU to it, as it already does for chat.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

const OBJECTIVE = 'Create hello.js that prints hi, and hello.test.js that checks it. Run:\nnode --test hello.test.js'
const write = (path: string, content: string) => JSON.stringify({ type: 'tool', toolId: 'write_file', input: { path, content } })
const busy = () => { throw new Error('builder_runpod_primary_busy') }
const runner = { async run() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false } } }

test('a busy model mid-build is a wait: the same round is retried and the build continues', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const replies: Array<() => string> = [
    () => write('hello.js', "console.log('hi')\n"),
    busy,
    () => write('hello.test.js', "require('node:test')('hi', () => {})\n"),
    () => { throw new Error('test_stops_here') },
  ]
  let calls = 0
  const ai = { async generate() { calls += 1; return replies.shift()!() } }
  const result = await new BuilderToolLoop(ai, workspace, runner).run({ objective: OBJECTIVE, workspaceId: 'busy-wait', shouldPause: () => false })
  assert.equal(result.ok, false)
  assert.equal(result.ok === false ? result.error : '', 'test_stops_here', 'the busy model did not end the job')
  assert.deepEqual(result.trace.filter(item => item.toolId === 'write_file' && item.ok).map(item => item.input.path), ['hello.js', 'hello.test.js'])
  assert.equal(calls, 4)
})

test('a model that stays busy until the slice ends saves progress instead of failing; the lost round is not counted', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let pauseNow = false
  const replies: Array<() => string> = [() => write('hello.js', "console.log('hi')\n"), () => { pauseNow = true; return busy() }]
  const ai = { async generate() { return replies.shift()!() } }
  const result = await new BuilderToolLoop(ai, workspace, runner).run({ objective: OBJECTIVE, workspaceId: 'busy-pause', shouldPause: () => pauseNow })
  assert.equal(result.ok, false)
  assert.equal(result.ok === false ? result.error : '', 'builder_job_paused')
  const checkpoint = result.ok === false ? result.checkpoint : undefined
  assert.ok(checkpoint, 'progress was saved for the automatic continuation')
  assert.equal(checkpoint.attempt, 1, 'only the productive round is counted')
  assert.deepEqual(checkpoint.trace.filter(item => item.toolId === 'write_file').map(item => item.input.path), ['hello.js'])
  assert.deepEqual((await workspace.listFiles('busy-pause')).map(file => file.path), ['hello.js'])
})

test('the saved progress resumes and the build continues after the model frees up', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let pauseNow = false
  const first = [() => write('hello.js', "console.log('hi')\n"), () => { pauseNow = true; return busy() }]
  const paused = await new BuilderToolLoop({ async generate() { return first.shift()!() } }, workspace, runner)
    .run({ objective: OBJECTIVE, workspaceId: 'busy-resume', shouldPause: () => pauseNow })
  const checkpoint = paused.ok === false ? paused.checkpoint : undefined
  assert.ok(checkpoint)
  pauseNow = false
  const second = [() => write('hello.test.js', "require('node:test')('hi', () => {})\n"), () => { throw new Error('test_stops_here') }]
  const resumed = await new BuilderToolLoop({ async generate() { return second.shift()!() } }, workspace, runner)
    .run({ objective: OBJECTIVE, workspaceId: 'busy-resume', shouldPause: () => pauseNow, checkpoint })
  assert.equal(resumed.ok === false ? resumed.error : '', 'test_stops_here')
  assert.deepEqual((await workspace.listFiles('busy-resume')).map(file => file.path).sort(), ['hello.js', 'hello.test.js'])
})

test('other model failures still end the job; a run with no saved-progress support still reports busy', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const broken = await new BuilderToolLoop({ async generate(): Promise<string> { throw new Error('builder_model_call_failed') } }, workspace, runner)
    .run({ objective: OBJECTIVE, workspaceId: 'broken', shouldPause: () => false })
  assert.equal(broken.ok === false ? broken.error : '', 'builder_model_call_failed')
  const unpausable = await new BuilderToolLoop({ async generate(): Promise<string> { return busy() } }, workspace, runner)
    .run({ objective: OBJECTIVE, workspaceId: 'unpausable' })
  assert.equal(unpausable.ok === false ? unpausable.error : '', 'builder_runpod_primary_busy')
})

test('a Builder job a person started claims GPU priority; background Self-Healing work does not', () => {
  const source = readFileSync(new URL('../lib/cos/aiPort.ts', import.meta.url), 'utf8')
  const port = source.slice(source.indexOf('export function createBuilderCodingAiPort'), source.indexOf('tryRunpodPrimaryInference({', source.indexOf('export function createBuilderCodingAiPort')))
  assert.match(port, /if \(options\.yieldToChat !== true\) await markChatRunpodDemand\(\)/)
  // Self-Healing jobs (yieldToChat) still step aside while that demand is recent.
  assert.match(port, /options\.yieldToChat === true && await chatHasRunpodPriority\(\)/)
  const runnerSource = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  assert.match(runnerSource, /createBuilderCodingAiPort\(\{ yieldToChat: selfHealingCapacityJob\(job\) \}\)/)
})
// end of saas/tests/builderModelBusyWaits.node.test.ts (if this line is missing, the paste was cut short)
