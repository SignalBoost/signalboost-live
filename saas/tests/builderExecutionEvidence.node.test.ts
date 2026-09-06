import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import { builderEvidenceReply, formatBuilderExecutionEvidence, isBuilderEvidenceRequest } from '../lib/builder/execution-evidence.ts'

const userId = '11111111-1111-4111-8111-111111111111'
const conversationId = '22222222-2222-4222-8222-222222222222'
const workspaceId = '33333333-3333-4333-8333-333333333333'
const id = '44444444-4444-4444-8444-444444444444'
const trace = [{ toolId: 'run', command: 'node hello.js; echo EXIT_CODE:$?', exitCode: 0, stdout: 'Hello from COS Builder.\nEXIT_CODE:0\n', stderr: '' }]
const job = { id, userId, conversationId, workspaceId, status: 'succeeded', metadata: {}, result: { trace } }
const input = { prompt: 'Show the recorded execution evidence for that Builder job: exact command, exit code, stdout, and stderr. Do not rerun it or reconstruct missing evidence.', userId, conversationId,
  priorAnswer: `Builder files: [Download hello.js](/api/builder/workspaces/${workspaceId}/files/hello.js)`, allowRepositoryEvidence: false }

test('create, execute with real Node, render evidence, and retrieve it without another run', async () => {
  const prompt = 'Create hello.js that prints “Hello from COS Builder.” Run it with Node. Show the exact command, exit code, and output, and provide the downloadable file. Do not claim success unless execution succeeds.'
  assert.equal(await builderEvidenceReply({ ...input, prompt }, async () => { assert.fail('new request must not read old jobs'); return null }), null)
  const workspace = new InMemoryBuilderWorkspace()
  const responses = [
    JSON.stringify({ type: 'tool', toolId: 'write_file', input: { path: 'hello.js', content: 'console.log("Hello from COS Builder.")' } }),
    JSON.stringify({ type: 'tool', toolId: 'run', input: { command: 'node hello.js' } }),
  ]
  const directory = await mkdtemp(join(tmpdir(), 'builder-proof-'))
  let runs = 0
  try {
    const result = await new BuilderToolLoop({ async generate() { return responses.shift() || null } }, workspace, {
      async run(request) {
        assert.equal(request.command, 'node hello.js')
        const file = request.files.find(file => file.path === 'hello.js')!
        await writeFile(join(directory, 'hello.js'), file.content)
        runs++
        return { exitCode: 0, stdout: execFileSync(process.execPath, ['hello.js'], { cwd: directory, encoding: 'utf8' }), stderr: '', timedOut: false }
      },
    }).run({ objective: prompt, workspaceId })
    assert.equal(result.ok, true)
    const savedTrace = result.trace.filter(item => item.toolId === 'run').map(item => ({ toolId: 'run', command: item.input.command, ...(item.output as object) }))
    assert.match(formatBuilderExecutionEvidence(savedTrace), /Hello from COS Builder\./)
    const reply = await builderEvidenceReply(input, async () => ({ ...job, result: { trace: savedTrace } }))
    assert.match(reply!, /Exit code: 0/)
    assert.match(reply!, /Hello from COS Builder\./)
    assert.equal(runs, 1)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

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
  for (const prompt of [
    'Create hello.js that prints “Hello from COS Builder.” Run it with Node. Show the exact command, exit code, and output, and provide the downloadable file. Do not claim success unless execution succeeds.',
    'Please create hello.js, run it, and show Builder execution evidence.',
    'Can you write a Python script and show the Builder job stdout and exit code?',
    'Show the recorded Builder evidence, then run the job again.',
    'Run hello.js and provide Builder job execution evidence.',
    'Create hello.js and run it.', 'What is Builder?', 'Show the weather', 'Build a website showing job evidence',
  ]) {
    assert.equal(isBuilderEvidenceRequest(prompt), false)
    assert.equal(await builderEvidenceReply({ ...input, prompt }, async () => { assert.fail('new work must not look up old evidence'); return null }), null)
  }
})

test('read-only follow-ups still match despite quoted create/run instructions and negation', () => {
  for (const prompt of [input.prompt, 'Show the saved stdout and stderr for the last Builder job. Do not execute anything.',
    'What exit code did that Builder job return?', 'Show recorded execution evidence for the previous run.',
    'Show the recorded evidence for the Builder job "Create hello.js and run it". Do not rerun it.',
  ]) assert.equal(isBuilderEvidenceRequest(prompt), true, prompt)
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
  assert.doesNotMatch(specialist, /await workspace.writeFile\(workspaceId, 'index.html', travelLandingPageHtml\(\)\)/)
  assert.match(runner, /historyReply\(`\$\{baseReply\}.*formatBuilderExecutionEvidence\(trace\)/)
  assert.ok(specialist.indexOf('await builderEvidenceReply(') < specialist.indexOf('if (input.allowRepositoryRepair'))
  const read = store.slice(store.indexOf('export async function readBuilderEvidenceJob'), store.indexOf('export async function enqueueBuilderJob'))
  assert.match(read, /\.eq\('user_id', input.userId\)\.eq\('conversation_id', input.conversationId\)/)
  assert.doesNotMatch(read, /\.rpc\(|\.update\(|\.insert\(|runBuilderJob/)
  assert.match(readFileSync('scripts/vercel-cos-gates.mjs', 'utf8'), /builderExecutionEvidence.node.test.ts/)
})

test('live explanation follow-up reaches an authorized read-only source explanation', async () => {
  const prompt = 'Explain why total.js failed and exactly what changed, using the actual source and recorded results. Do not rerun any commands.'
  let explanations = 0
  assert.equal(isBuilderEvidenceRequest(prompt), true)
  assert.equal(await builderEvidenceReply({ ...input, prompt }, async () => job, async authorized => {
    assert.equal(authorized, job)
    explanations++
    return 'source explanation'
  }), 'source explanation')
  await builderEvidenceReply({ ...input, prompt }, async () => ({ ...job, userId: id }), async () => { assert.fail('wrong owner'); return '' })
  assert.equal(explanations, 1)
  assert.equal(isBuilderEvidenceRequest('Explain why total.js failed, then run node total.js.'), false)
})

test('explanation reads current source and discloses missing historical diff', async () => {
  const { explainBuilderEvidence } = await import('../lib/builder/explain-evidence.ts')
  const reply = await explainBuilderEvidence({ prompt: 'Explain the repair', job: { ...job, result: { trace: [{ toolId: 'edit_file', path: 'total.js', ok: true }, ...trace] } },
    workspace: { async readFile(workspace, path) { assert.equal(workspace, workspaceId); assert.equal(path, 'total.js'); return { path, content: 'index < values.length', updatedAt: 1 } } },
    ai: { async generate(request) {
      assert.match(request.systemPrompt, /cannot verify the exact change/)
      assert.match(request.prompt, /index < values.length/)
      assert.match(request.prompt, /Hello from COS Builder/)
      return JSON.stringify({ type: 'answer', answer: 'The saved test passed. The exact earlier source is unavailable.' })
    } },
  })
  assert.match(reply, /exact earlier source is unavailable/)
  assert.match(reply, /no code was rerun/)
})
