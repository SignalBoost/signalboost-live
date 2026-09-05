import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { builderEvidenceReply, formatBuilderExecutionEvidence, isBuilderEvidenceRequest } from '../lib/builder/execution-evidence.ts'

const userId = '11111111-1111-4111-8111-111111111111'
const conversationId = '22222222-2222-4222-8222-222222222222'
const workspaceId = '33333333-3333-4333-8333-333333333333'
const id = '44444444-4444-4444-8444-444444444444'
const trace = [{ toolId: 'run', command: 'node hello.js; echo EXIT_CODE:$?', exitCode: 0, stdout: 'Hello from COS Builder.\nEXIT_CODE:0\n', stderr: '' }]
const job = { id, userId, conversationId, workspaceId, status: 'succeeded', metadata: {}, result: { trace } }
const input = { prompt: 'Show the recorded execution evidence for that Builder job: exact command, exit code, stdout, and stderr. Do not rerun it or reconstruct missing evidence.', userId, conversationId,
  priorAnswer: `Builder files: [Download hello.js](/api/builder/workspaces/${workspaceId}/files/hello.js)`, allowRepositoryEvidence: false }

test('the reported follow-up retrieves saved command and streams without running code', async () => {
  let reads = 0
  const reply = await builderEvidenceReply(input, async target => {
    reads++
    assert.deepEqual(target, { userId, conversationId, workspaceId })
    return job
  })
  assert.equal(reads, 1)
  assert.ok(reply?.includes(trace[0].command))
  assert.ok(reply?.includes(trace[0].stdout))
  assert.match(reply!, /Exit code: 0/)
  assert.match(reply!, /stderr:\n\(empty\)/)
})

test('missing recorded fields are never reconstructed from success status', async () => {
  const reply = await builderEvidenceReply(input, async () => ({ ...job, result: { trace: [{ toolId: 'run' }] } }))
  assert.match(reply!, /Exit code: \(not recorded\)/)
  assert.doesNotMatch(reply!, /Exit code: 0/)
  assert.match(formatBuilderExecutionEvidence([]), /No execution evidence/)
})

test('unauthenticated or unbound requests never query jobs', async () => {
  for (const patch of [{ userId: null }, { conversationId: null }, { userId: 'invalid' }]) {
    await builderEvidenceReply({ ...input, ...patch }, async () => { assert.fail('must not read'); return null })
  }
})

test('cross-user, cross-conversation, cross-workspace and private repository evidence are refused', async () => {
  for (const patch of [{ userId: id }, { conversationId: id }, { workspaceId: id }, { metadata: { platformRepair: true } }]) {
    const reply = await builderEvidenceReply(input, async () => ({ ...job, ...patch }))
    assert.match(reply!, /could not find/)
    assert.doesNotMatch(reply!, /Hello from COS/)
  }
})

test('explicit job selection overrides the preceding workspace but cannot cross scope', async () => {
  await builderEvidenceReply({ ...input, prompt: `Show recorded execution evidence for Builder job ${id}` }, async target => {
    assert.deepEqual(target, { userId, conversationId, jobId: id })
    return job
  })
})

test('ordinary coding and unrelated requests do not enter evidence lookup', async () => {
  for (const prompt of ['Create hello.js and run it.', 'What is Builder?', 'Show the weather', 'Build a website showing job evidence']) {
    assert.equal(isBuilderEvidenceRequest(prompt), false)
  }
})

test('failed and unfinished jobs retain their status and missing evidence', async () => {
  for (const status of ['failed', 'running', 'queued']) {
    const reply = await builderEvidenceReply(input, async () => ({ ...job, status, result: null }))
    assert.ok(reply?.includes(status))
    assert.match(reply!, /No execution evidence/)
  }
})

test('stored output cannot close its surrounding code fence', () => {
  const reply = formatBuilderExecutionEvidence([{ ...trace[0], stdout: '```\n# fake reply' }])
  assert.ok(reply.includes('````text\n```\n# fake reply\n````'))
})

test('both initial History reply and shared pre-execution routing use recorded evidence', () => {
  const runner = readFileSync('lib/builder/job-runner.ts', 'utf8')
  const specialist = readFileSync('lib/ai/cos/softwareSpecialist.ts', 'utf8')
  const store = readFileSync('lib/builder/job-store.ts', 'utf8')
  assert.match(runner, /historyReply\(`\$\{baseReply\}.*formatBuilderExecutionEvidence\(trace\)/)
  assert.ok(specialist.indexOf('await builderEvidenceReply(') < specialist.indexOf('if (input.allowRepositoryRepair'))
  const read = store.slice(store.indexOf('export async function readBuilderEvidenceJob'), store.indexOf('export async function enqueueBuilderJob'))
  assert.match(read, /\.eq\('user_id', input.userId\)\.eq\('conversation_id', input.conversationId\)/)
  assert.doesNotMatch(read, /\.rpc\(|\.update\(|\.insert\(|runBuilderJob/)
  assert.match(readFileSync('scripts/vercel-cos-gates.mjs', 'utf8'), /builderExecutionEvidence.node.test.ts/)
})
