import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

const objective = 'Create app.js and app.test.js, then run node --test app.test.js'
const action = (path: string, content: string) =>
  JSON.stringify({ type: 'tool', toolId: 'write_file', input: { path, content } })

test('writes then model timeout saves a verification-first continuation, not a failed job', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let calls = 0
  const generate = async () => {
    calls += 1
    if (calls === 1) return action('app.js', "module.exports = () => 42;\n")
    if (calls === 2) return action('app.test.js', "const { test } = require('node:test'); const assert = require('node:assert/strict'); test('value', () => assert.equal(require('./app')(), 42));\n")
    throw new Error('builder_model_round_timeout')
  }
  const executions: string[] = []
  const runner = { async run(input: { command: string }) {
    executions.push(input.command)
    return { executedCommand: input.command, exitCode: 0, stdout: '1 passed', stderr: '', timedOut: false }
  } }
  const first = await new BuilderToolLoop({ generate }, workspace, runner).run({
    objective, workspaceId: 'timeout-verification', shouldPause: () => false,
  })
  assert.equal(first.ok, false)
  if (first.ok) throw new Error('expected saved continuation')
  assert.equal(first.checkpoint?.verificationPending, true)
  assert.equal(executions.length, 0)
  assert.deepEqual((await workspace.listFiles('timeout-verification')).map(x => x.path).sort(), ['app.js', 'app.test.js'])
  let modelSawVerification = false
  const second = await new BuilderToolLoop({ async generate() {
    modelSawVerification = executions.length > 0
    return JSON.stringify({ type: 'answer', answer: 'Verification complete' })
  } }, workspace, runner).run({
    objective, workspaceId: 'timeout-verification', checkpoint: first.checkpoint, shouldPause: () => false,
  })
  assert.ok(executions.length >= 1, 'real host runner was invoked before another model turn')
  assert.match(executions[0], /test/)
  assert.ok(modelSawVerification || second.ok, 'a passing proof may complete directly; otherwise model sees proof')
  assert.equal(second.ok, true)
})
test('accepted requests expose verifying status without a second POST', () => {
  const source = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
  const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  assert.match(source, /job\.result\?\.verificationPending === true/)
  assert.match(source, /Files written — verifying changes/)
  assert.match(runner, /result\.checkpoint\.verificationPending/)
  assert.match(source, /\}, \{ status: 202 \}\)/)
})

test('the verifying status is reachable without loading the checkpoint on every status poll', () => {
  const store = readFileSync(new URL('../lib/builder/job-store.ts', import.meta.url), 'utf8')
  const select = store.match(/const JOB_SELECT = '([^']*)'/)?.[1] ?? ''
  assert.ok(select.split(',').includes('result') && !select.split(',').includes('checkpoint'))
  const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  assert.match(runner, /verificationPending: result\.checkpoint\.verificationPending === true/)
})
