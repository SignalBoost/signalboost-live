// saas/tests/builderModelDeadlineChunks.node.test.ts
//
// Production 2026-10-14 (OrderFlow job 7cc550aa, provider_inference_usage): 69 of 110 Builder model calls hit the ~55s
// round deadline (timeout:inference_owner_deadline, avg 50.3s) and returned nothing; the 41 that finished averaged 178
// tokens, the longest 1,630. Each new file was requested whole, and a timed-out round was retried unchanged, so the test
// files never fit: 24 slices wrote 8 of 15 files and no command ran. New files are now requested in 2000-character
// append chunks, and a timed-out round is retried once with a bounded-output instruction instead of the same request.
import assert from 'node:assert/strict'
import test from 'node:test'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

const OBJECTIVE = 'Create hello.js that prints hi, and hello.test.js that checks it. Run:\nnode --test hello.test.js'
const runner = { async run() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false } } }
const chunk = (path: string, offset: number, content: string, final: boolean) =>
  JSON.stringify({ type: 'tool', toolId: 'write_file', input: { path, mode: 'append', offset, content, final } })

test('a new file is requested in bounded append chunks, not as one whole-file response', async () => {
  const prompts: string[] = []
  const ai = { async generate({ prompt }: { prompt: string }) { prompts.push(prompt); throw new Error('test_stops_here') } }
  await new BuilderToolLoop(ai, new InMemoryBuilderWorkspace(), runner).run({ objective: OBJECTIVE, workspaceId: 'ask', shouldPause: () => false })
  assert.match(prompts[0], /CURRENT STEP: Create the complete file "hello\.js" with write_file mode:"append" chunks of at most 2000 characters/)
  assert.match(prompts[0], /final:true on the last chunk \(a short file is one chunk with final:true\)/)
})

test('a timed-out round is retried once with a bounded-output instruction, and the file is assembled from chunks', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const prompts: string[] = []
  const replies: Array<() => string> = [
    () => { throw new Error('builder_model_round_timeout') },
    () => chunk('hello.js', 0, "console.log(", false),
    () => chunk('hello.js', 12, "'hi')\n", true),
    () => { throw new Error('test_stops_here') },
  ]
  const ai = { async generate({ prompt }: { prompt: string }) { prompts.push(prompt); return replies.shift()!() } }
  const result = await new BuilderToolLoop(ai, workspace, runner).run({ objective: OBJECTIVE, workspaceId: 'deadline', shouldPause: () => false })
  assert.equal(result.ok === false ? result.error : '', 'test_stops_here', 'the timeout did not end the slice')
  assert.doesNotMatch(prompts[0], /TIME LIMIT RECOVERY/)
  assert.match(prompts[1], /TIME LIMIT RECOVERY: The previous response did not finish within the model time limit/, 'not the identical request again')
  assert.equal((await workspace.readFile('deadline', 'hello.js'))?.content, "console.log('hi')\n")
  assert.equal(result.trace.filter(item => item.toolId === 'write_file' && item.ok).length, 2, 'each chunk is recorded progress')
})

test('a second timeout in the same round still ends the slice with its progress for the capacity re-queue', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let calls = 0
  const ai = { async generate(): Promise<string> {
    calls += 1
    if (calls === 1) return chunk('hello.js', 0, "console.log('hi')\n", true)
    throw new Error('builder_model_round_timeout')
  } }
  const result = await new BuilderToolLoop(ai, workspace, runner).run({ objective: OBJECTIVE, workspaceId: 'twice', shouldPause: () => false })
  assert.equal(result.ok === false ? result.error : '', 'builder_model_round_timeout')
  assert.equal(calls, 3, 'one write, then the timed-out round and exactly one bounded retry')
  const checkpoint = result.ok === false ? result.checkpoint : undefined
  assert.ok(checkpoint, 'progress travels with the re-queue')
  assert.deepEqual((await workspace.listFiles('twice')).map(file => file.path), ['hello.js'])
})

test('no retry is started once the slice must pause', async () => {
  let calls = 0
  let pauseNow = false
  const ai = { async generate(): Promise<string> { calls += 1; pauseNow = true; throw new Error('builder_model_round_timeout') } }
  const result = await new BuilderToolLoop(ai, new InMemoryBuilderWorkspace(), runner).run({ objective: OBJECTIVE, workspaceId: 'late', shouldPause: () => pauseNow })
  assert.equal(result.ok === false ? result.error : '', 'builder_model_round_timeout')
  assert.equal(calls, 1)
})
// end of saas/tests/builderModelDeadlineChunks.node.test.ts (if this line is missing, the paste was cut short)
