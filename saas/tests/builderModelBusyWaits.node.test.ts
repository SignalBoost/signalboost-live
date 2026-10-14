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

test('a model still busy when the slice ends reports busy WITH this slice\'s progress; the lost round is not counted', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let pauseNow = false
  const replies: Array<() => string> = [() => write('hello.js', "console.log('hi')\n"), () => { pauseNow = true; return busy() }]
  const ai = { async generate() { return replies.shift()!() } }
  const result = await new BuilderToolLoop(ai, workspace, runner).run({ objective: OBJECTIVE, workspaceId: 'busy-pause', shouldPause: () => pauseNow })
  assert.equal(result.ok, false)
  assert.equal(result.ok === false ? result.error : '', 'builder_runpod_primary_busy', 'the job runner re-queues it for capacity')
  const checkpoint = result.ok === false ? result.checkpoint : undefined
  assert.ok(checkpoint, 'progress travels with the re-queue')
  assert.equal(checkpoint.attempt, 1, 'only the productive round is counted')
  assert.deepEqual(checkpoint.trace.filter(item => item.toolId === 'write_file').map(item => item.input.path), ['hello.js'])
  assert.deepEqual((await workspace.listFiles('busy-pause')).map(file => file.path), ['hello.js'])
})

test('a timed-out model round also hands this slice\'s progress to the capacity re-queue and resumes by verifying', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let calls = 0
  const ai = { async generate() {
    calls += 1
    if (calls === 1) return write('hello.js', "console.log('hi')\n")
    throw new Error('builder_model_round_timeout')
  } }
  const result = await new BuilderToolLoop(ai, workspace, runner).run({ objective: OBJECTIVE, workspaceId: 'timeout', shouldPause: () => false })
  assert.equal(result.ok === false ? result.error : '', 'builder_model_round_timeout')
  const checkpoint = result.ok === false ? result.checkpoint : undefined
  assert.ok(checkpoint, 'Codex review of #4321: a null checkpoint would erase the earlier progress')
  assert.equal(checkpoint.attempt, 1)
  assert.equal(checkpoint.verificationPending, true, '#4323: completed writes are verified first on resume')
  assert.deepEqual(checkpoint.trace.filter(item => item.toolId === 'write_file').map(item => item.input.path), ['hello.js'])
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

test('only a Builder job a person started claims GPU priority; Self-Healing and repository repairs never do', () => {
  const source = readFileSync(new URL('../lib/cos/aiPort.ts', import.meta.url), 'utf8')
  const port = source.slice(source.indexOf('export function createBuilderCodingAiPort'), source.indexOf('tryRunpodPrimaryInference({', source.indexOf('export function createBuilderCodingAiPort')))
  assert.match(port, /if \(options\.yieldToChat === false\) await markChatRunpodDemand\(\)/)
  assert.match(port, /options\.yieldToChat === true && await chatHasRunpodPriority\(\)/)
  const runnerSource = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  assert.match(runnerSource, /createBuilderCodingAiPort\(\{ yieldToChat: selfHealingCapacityJob\(job\) \}\)/)
  // Self-Healing repository repairs build their port without options, so they never mark live demand.
  const repairSource = readFileSync(new URL('../lib/builder/repository-repair.ts', import.meta.url), 'utf8')
  assert.match(repairSource, /createBuilderCodingAiPort\(\)/)
})

test('capacity is re-queued with the current progress before a work slice is spent', () => {
  const runnerSource = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  const requeue = runnerSource.indexOf("await deferSelfHealingCapacity(job, result.error, trace, result.checkpoint ?? null)) return")
  const pause = runnerSource.indexOf('if (result.ok === false && result.checkpoint && job.claimGeneration < 4) {')
  assert.ok(requeue > 0 && pause > requeue, 're-queue for capacity comes before the ordinary pause')
  assert.equal(runnerSource.split('await deferSelfHealingCapacity(job, result.error, trace').length - 1, 1, 'one capacity re-queue on the tool-loop result path')
  // No migration: the slice's checkpoint is stored on this exact running claim, then the existing
  // four-argument deferral function re-queues the job (Production still runs that function).
  const store = readFileSync(new URL('../lib/builder/job-store.ts', import.meta.url), 'utf8')
  const defer = store.slice(store.indexOf('export async function deferBuilderJobForCapacity('), store.indexOf('export async function reconcileStaleBuilderJobs('))
  assert.match(defer, /\.update\(\{ checkpoint: input\.checkpoint \?\? null \}\)/)
  assert.match(defer, /\.eq\('status', 'running'\)\.eq\('claim_generation', input\.job\.claimGeneration\)/)
  assert.ok(defer.indexOf('.update({ checkpoint') < defer.indexOf("db.rpc('defer_builder_job_capacity'"), 'progress is stored before the re-queue')
  assert.doesNotMatch(defer, /p_checkpoint/, 'the RPC call matches the deployed four-argument function')
})

test('RunPod busy attempts assigned fallback before durable queueing', () => {
  const source = readFileSync(new URL('../lib/cos/aiPort.ts', import.meta.url), 'utf8')
  const port = source.slice(source.indexOf('export function createBuilderCodingAiPort('), source.indexOf('export function createLocalApplianceAiPort('))
  const busyIndex = port.indexOf("const runpodBusy = runpod.attempted && runpod.reason === 'runpod_primary_busy'")
  const assignedIndex = port.indexOf('await tryAssignedPlatformModelTurn(', busyIndex)
  const queueIndex = port.indexOf("if (runpodBusy) throw new Error('builder_runpod_primary_busy')", assignedIndex)
  assert.ok(busyIndex >= 0 && assignedIndex > busyIndex && queueIndex > assignedIndex)
  assert.match(port.slice(assignedIndex, queueIndex), /if \(assigned\.attempted\) return requireText/)
  assert.doesNotMatch(port.slice(busyIndex, assignedIndex), /throw new Error\('builder_runpod_primary_busy'\)/)
})
// end of saas/tests/builderModelBusyWaits.node.test.ts (if this line is missing, the paste was cut short)
