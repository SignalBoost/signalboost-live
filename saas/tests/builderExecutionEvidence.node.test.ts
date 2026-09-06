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
  assert.match(runner, /historyReply\(await initialReply\(baseReply, 'succeeded'\)/)
  assert.match(runner, /explainInitialBuilderRepair\(/)
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
      if (request.systemPrompt.startsWith('BUILDER EXPLANATION EVIDENCE REVIEW')) return '{"supported":true}'

      assert.match(request.systemPrompt, /cannot verify the exact change/)
      assert.match(request.prompt, /index < values.length/)
      assert.match(request.prompt, /Hello from COS Builder/)
      return JSON.stringify({ type: 'answer', answer: 'The saved test passed. The exact earlier source is unavailable.' })
    } },
  })
  assert.match(reply, /exact earlier source is unavailable/)
  assert.match(reply, /no code was rerun/)
})

test('general software explanations do not divert into Builder history', async () => {
  for (const prompt of ['Explain source maps in JavaScript', 'Why is code review important?', 'Explain how Builder works']) {
    assert.equal(isBuilderEvidenceRequest(prompt), false)
    assert.equal(await builderEvidenceReply({ ...input, prompt }, async () => { assert.fail('ordinary question'); return null }), null)
  }
})

test('project questions read the scoped saved project without authorizing work', async () => {
  for (const prompt of ['How do I use this app?', 'Explain how report.js works.', 'What should I do next?', 'Does this CLI support refunds?']) {
    let reads = 0
    assert.equal(await builderEvidenceReply({ ...input, prompt }, async target => {
      reads++
      assert.deepEqual(target, { userId, conversationId, workspaceId })
      return job
    }, async authorized => { assert.equal(authorized, job); return 'Project guidance' }), 'Project guidance')
    assert.equal(reads, 1)
  }
})

test('project conversation does not steal new work, unrelated next steps or another user’s source', async () => {
  assert.equal(await builderEvidenceReply({ ...input, prompt: 'Explain how this app works.', hasNewSource: true }, async () => { assert.fail('new files'); return null }), null)
  for (const prompt of ['Explain this app, then deploy it.', 'How does this app work? Add logging.', 'Explain this app and run npm test.']) {
    assert.equal(await builderEvidenceReply({ ...input, prompt }, async () => { assert.fail('new work'); return null }), null)
  }
  assert.equal(await builderEvidenceReply({ ...input, prompt: 'What is next?', priorAnswer: 'Weather forecast' }, async () => { assert.fail('unrelated context'); return null }), null)
  for (const candidate of [null, { ...job, userId: id }, { ...job, conversationId: id }, { ...job, metadata: { platformRepair: true } }]) {
    assert.equal(await builderEvidenceReply({ ...input, prompt: 'How do I use this app?' }, async () => candidate, async () => { assert.fail('unauthorized source'); return '' }), null)
  }
})

test('run-first imported jobs explain from their saved artifact list', async () => {
  const { explainBuilderEvidence } = await import('../lib/builder/explain-evidence.ts')
  const reply = await explainBuilderEvidence({ prompt: 'Explain why that run failed in index.js', job: { ...job, result: { files: ['package.json', 'index.js'], trace } },
    workspace: { async readFile(workspace, path) { assert.equal(workspace, workspaceId); return { path, content: path === 'index.js' ? 'module.exports = 42' : '{}', updatedAt: 1 } } },
    ai: { async generate(request) {
      if (request.systemPrompt.startsWith('BUILDER EXPLANATION EVIDENCE REVIEW')) return '{"supported":true}'
 assert.match(request.prompt, /module.exports = 42/); return '{"type":"answer","answer":"The recorded run succeeded."}' } },
  })
  assert.match(reply, /current workspace files/)
})


test('initial repair explains actual failure, edit and passing check without a follow-up', async () => {
  const { explainInitialBuilderRepair } = await import('../lib/builder/explain-evidence.ts')
  const before = 'const assert = require("node:assert/strict"); assert.equal(1 + 1, 3)'
  const after = before.replace(', 3)', ', 2)')
  const directory = await mkdtemp(join(tmpdir(), 'builder-initial-'))
  try {
    await writeFile(join(directory, 'sum.cjs'), before)
    let failure = ''
    try { execFileSync(process.execPath, ['sum.cjs'], { cwd: directory, encoding: 'utf8', stdio: 'pipe' }); assert.fail('must fail') }
    catch (error: any) { assert.equal(error.status, 1); failure = error.stderr }
    await writeFile(join(directory, 'sum.cjs'), after)
    const stdout = execFileSync(process.execPath, ['sum.cjs'], { cwd: directory, encoding: 'utf8' })
    const recorded = [
      { toolId: 'run', command: 'node sum.cjs', exitCode: 1, stderr: failure, stdout: '' },
      { toolId: 'edit_file', ok: true, path: 'sum.cjs', change: { search: ', 3)', replace: ', 2)', truncated: false } },
      { toolId: 'run', command: 'node sum.cjs', exitCode: 0, stderr: '', stdout },
    ]
    const reply = await explainInitialBuilderRepair({ prompt: 'Repair sum.cjs', job: { ...job, result: { trace: recorded } },
      workspace: { async readFile() { return { path: 'sum.cjs', content: after, updatedAt: 1 } } },
      ai: { async generate(request) {
      if (request.systemPrompt.startsWith('BUILDER EXPLANATION EVIDENCE REVIEW')) return '{"supported":true}'

        const evidence = JSON.parse(request.prompt)
        assert.equal(evidence.currentFiles[0].content, after)
        assert.deepEqual(evidence.recordedTrace, recorded)
        assert.match(request.systemPrompt, /without requiring a follow-up question/)
        return JSON.stringify({ type: 'answer', answer: 'sum.cjs expected 3 for 1 + 1. The expectation changed to 2; the recorded check now passes.' })
      } }, fallback: 'Verified check passed.', deadlineAtMs: Date.now() + 5000 })
    assert.match(reply, /expected 3 for 1 \+ 1/)
    assert.match(reply, /Exit code: 1/)
    assert.match(reply, /Exit code: 0/)
    assert.doesNotMatch(reply, /no code was rerun/)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('initial explanation failures preserve execution evidence and terminal fallback', async () => {
  const { explainInitialBuilderRepair } = await import('../lib/builder/explain-evidence.ts')
  for (const response of ['not json', '{}', 'throw']) {
    const reply = await explainInitialBuilderRepair({ prompt: 'Repair', job, workspace: null,
      ai: { async generate() { if (response === 'throw') throw new Error('offline'); return response } },
      fallback: 'The check passed; source explanation unavailable.', deadlineAtMs: Date.now() + 5000 })
    assert.match(reply, /The check passed/)
    assert.match(reply, /Hello from COS Builder/)
  }
})

test('initial explanation skips exhausted budget and bounds a stalled source read', async t => {
  const { explainInitialBuilderRepair } = await import('../lib/builder/explain-evidence.ts')
  const ai = { async generate(): Promise<string> { assert.fail('must not call model') } }
  const fallback = 'Repair remains unverified.'
  const expired = await explainInitialBuilderRepair({ prompt: 'Repair', job, workspace: null, ai, fallback, deadlineAtMs: Date.now() })
  assert.match(expired, /Repair remains unverified/)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let release!: (value: null) => void
  const pending = explainInitialBuilderRepair({ prompt: 'Repair', job: { ...job, status: 'failed', result: { files: ['sum.cjs'], trace } },
    workspace: { readFile: () => new Promise(resolve => { release = resolve }) }, ai, fallback, deadlineAtMs: Date.now() + 2000 })
  t.mock.timers.tick(2001)
  assert.match(await pending, /Repair remains unverified/)
  release(null)
  await Promise.resolve()
})

test('a proposal is displayed only after its exact objective is persisted', async () => {
  const { explainBuilderEvidence } = await import('../lib/builder/explain-evidence.ts')
  const objective = 'Add a --help option to cli.js, preserve current behavior and tests.\nRun:\nnpm test\nnode cli.js --help'
  for (const saveFails of [false, true]) {
    let saved = ''
    const reply = await explainBuilderEvidence({ prompt: 'What improvement is next for this app?', job, workspace: null,
      ai: { async generate(request) {
      if (request.systemPrompt.startsWith('BUILDER EXPLANATION EVIDENCE REVIEW')) return '{"supported":true}'

        assert.match(request.systemPrompt, /MUST include a top-level proposal string/)
        assert.match(request.systemPrompt, /No deployment, publishing, credentials/)
        assert.equal(JSON.parse(request.prompt).proposalInstructions, undefined)
        return JSON.stringify({ type: 'answer', answer: 'A help option would explain CLI usage.', proposal: objective })
      } },
      saveProposal: async value => { if (saveFails) throw new Error('offline'); saved = value },
    })
    if (saveFails) { assert.equal(saved, ''); assert.doesNotMatch(reply, /Say “go”/) }
    else { assert.equal(saved, objective); assert.ok(reply.includes(objective)); assert.match(reply, /Say “go”/) }
  }
})

test('proposal approval is exact, scoped to unchanged evidence and not reconstructed from chat', async () => {
  const { isBuilderProposalApproval, proposalObjective, workspaceFingerprint, readBuilderProposal, proposalMatches } = await import('../lib/builder/proposal.ts')
  const objective = 'Add a --help option to cli.js.\nRun:\nnpm test\nnode cli.js --help'
  const fingerprint = workspaceFingerprint([{ path: 'cli.js', content: 'original' }])
  const proposal = { id, sourceJobId: id, objective, fingerprint, expiresAt: 2000 }
  for (const text of ['go', 'Go ahead.', 'do it', 'proceed', 'implement that']) assert.equal(isBuilderProposalApproval(text), true)
  for (const text of ['go to the website', 'yes', 'go but deploy it too', 'do not do it']) assert.equal(isBuilderProposalApproval(text), false)
  assert.deepEqual(readBuilderProposal(proposal), proposal)
  assert.equal(proposalObjective('Add logging and deploy to production.'), null)
  assert.equal(readBuilderProposal({ ...proposal, id: 'bad' }), null)
  const input = { sourceJobId: id, fingerprint, priorAnswer: `Proposed change:\n${objective}`, now: 1000 }
  assert.equal(proposalMatches(proposal, input), true)
  for (const patch of [{ sourceJobId: workspaceId }, { fingerprint: workspaceFingerprint([{ path: 'cli.js', content: 'changed' }]) }, { priorAnswer: 'Unrelated answer' }, { now: 2001 }]) {
    assert.equal(proposalMatches(proposal, { ...input, ...patch }), false)
  }
  assert.notEqual(workspaceFingerprint([{ path: 'cli.js', content: 'original' }, { path: 'new.js', content: '' }]), fingerprint)
})

test('proposal handoff uses a saved id once and rechecks source before worker execution', () => {
  const specialist = readFileSync('lib/ai/cos/softwareSpecialist.ts', 'utf8')
  const store = readFileSync('lib/builder/job-store.ts', 'utf8')
  const runner = readFileSync('lib/builder/job-runner.ts', 'utf8')
  assert.match(specialist, /jobId: proposal.id/)
  assert.match(specialist, /ownerAuthorized: false/)
  assert.match(store, /eq\('metadata', JSON.stringify\(job.metadata\)\)/)
  assert.match(runner, /job.claimGeneration === 1/)
  assert.ok(runner.indexOf("'builder_proposal_source_changed'") < runner.indexOf('await executeSignalBoostRepositoryRepair('))
})


test('proposal completion requires every promised command after the last edit', async () => {
  const { proposalObjective } = await import('../lib/builder/proposal.ts')
  const { builderTaskContract, builderTaskProgress } = await import('../lib/builder/task-contract.ts')
  const raw = 'Add a `--help` usage branch to `cli.js`; verify with `npm test` and `node cli.js --help`.'
  const objective = proposalObjective(raw)!
  assert.ok(objective.endsWith('Run:\nnpm test\nnode cli.js --help'))
  assert.equal(proposalObjective(objective), objective)
  assert.equal(proposalObjective('Add a helpful usage message to cli.js.'), null)
  const contract = builderTaskContract(objective)
  const trace: any[] = [{ toolId: 'edit_file', ok: true, input: { path: 'cli.js' } },
    { toolId: 'run', ok: true, input: { command: 'npm test' }, output: { exitCode: 0 } }]
  assert.deepEqual(builderTaskProgress(contract, ['cli.js'], trace).pendingCommands, ['node cli.js --help'])
  assert.equal(builderTaskProgress(contract, ['cli.js'], trace).satisfied, false)
  trace.push({ toolId: 'run', ok: true, input: { command: 'node cli.js --help' }, output: { exitCode: 0 } })
  assert.equal(builderTaskProgress(contract, ['cli.js'], trace).satisfied, true)
})


test('blocked requests, timeouts and missing outcomes do not become reproduced failures', async () => {
  const { builderEvidenceEvents } = await import('../lib/builder/evidence-events.ts')
  const { formatBuilderOperatorRepairReply } = await import('../lib/builder/operator-narration.ts')
  const recorded = [
    { toolId: 'run', ok: false, command: 'npm test', error: 'builder_repeated_tool_call:run; choose a different next step' },
    { toolId: 'run', ok: false, command: 'npm test', timedOut: true, exitCode: 124 },
    { toolId: 'run', ok: false, command: 'npm test' },
    { toolId: 'edit_file', ok: false, path: 'money.js', error: 'builder_verification_order_required' },
  ]
  assert.deepEqual(builderEvidenceEvents(recorded).map(item => item.outcome),
    ['blocked_before_execution', 'timed_out', 'execution_unconfirmed', 'blocked_before_mutation'])
  const reply = formatBuilderOperatorRepairReply({ ok: false, trace: recorded })
  assert.doesNotMatch(reply, /reproduced the reported failure/)
  const evidence = formatBuilderExecutionEvidence(recorded)
  assert.match(evidence, /blocked before execution/)
  assert.match(evidence, /builder_repeated_tool_call:run/)
  assert.match(evidence, /timed out/)
  assert.match(evidence, /execution unconfirmed/)
})

test('unsupported failed-edit narration is withheld in initial and follow-up responses', async () => {
  const { explainBuilderEvidence } = await import('../lib/builder/explain-evidence.ts')
  for (const presentation of ['initial', 'followup'] as const) {
    for (const verdict of ['{"supported":false}', '{}', 'not json', 'throw']) {
      let calls = 0
      let saved = false
      const recorded = [{ toolId: 'run', ok: false, command: 'npm test', error: 'builder_repeated_tool_call:run' }]
      const reply = await explainBuilderEvidence({ prompt: 'Explain the last repair', job: { ...job, result: { trace: recorded } },
        workspace: null, presentation, fallback: 'Source explanation unavailable.',
        saveProposal: async () => { saved = true },
        ai: { async generate(request) {
          calls++
          if (calls === 1) return JSON.stringify({ type: 'answer', answer: 'The edit failed because its search string did not match.',
            proposal: 'Add a test to money.test.js.\nRun:\nnpm test' })
          assert.match(request.systemPrompt, /Reject invented attempts/)
          const context = JSON.parse(request.prompt)
          assert.equal(context.events[0].toolId, 'run')
          assert.equal(context.events[0].outcome, 'blocked_before_execution')
          assert.match(context.draft, /search string/)
          if (verdict === 'throw') throw new Error('unavailable')
          return verdict
        } },
      })
      assert.equal(calls, 2)
      assert.equal(saved, false)
      assert.doesNotMatch(reply, /search string did not match/)
      assert.match(reply, /blocked before execution/)
    }
  }
})

test('unreviewed model details cannot leak through deterministic repair fallback', async () => {
  const { formatBuilderOperatorRepairReply } = await import('../lib/builder/operator-narration.ts')
  const reply = formatBuilderOperatorRepairReply({ ok: true, answer: 'An invented edit failed.', trace: [
    { toolId: 'run', ok: true, command: 'npm test', exitCode: 0 },
  ] })
  assert.doesNotMatch(reply, /invented edit/)
  assert.match(reply, /passed with exit code 0/)
})

test('a stalled explanation review preserves the terminal result within the existing deadline', async t => {
  const { explainInitialBuilderRepair } = await import('../lib/builder/explain-evidence.ts')
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let reviewing!: () => void
  const started = new Promise<void>(resolve => { reviewing = resolve })
  let release!: (value: string) => void
  const pending = explainInitialBuilderRepair({ prompt: 'Explain repair', job, workspace: null,
    fallback: 'Recorded check passed.', deadlineAtMs: Date.now() + 2000,
    ai: { async generate(request) {
      if (!request.systemPrompt.startsWith('BUILDER EXPLANATION EVIDENCE REVIEW')) return '{"type":"answer","answer":"Unreviewed draft."}'
      reviewing()
      return new Promise(resolve => { release = resolve })
    } },
  })
  await started
  t.mock.timers.tick(2001)
  const reply = await pending
  assert.match(reply, /Recorded check passed/)
  assert.doesNotMatch(reply, /Unreviewed draft/)
  release('{"supported":true}')
  await Promise.resolve()
})

test('unfinished chunk state survives both public serializers and cannot claim a changed file', async () => {
  const { builderPendingWriteEvidence, builderEvidenceEvents } = await import('../lib/builder/evidence-events.ts')
  const { formatBuilderOperatorRepairReply } = await import('../lib/builder/operator-narration.ts')
  // A successful staging operation has not yet mutated the workspace.
  const stored = JSON.parse(JSON.stringify({ toolId: 'write_file', ok: true, path: 'large.js',
    ...builderPendingWriteEvidence({ path: 'large.js', offset: 1024, pending: true }) }))
  assert.equal(builderEvidenceEvents([stored])[0].outcome, 'assembly_pending')
  assert.doesNotMatch(formatBuilderOperatorRepairReply({ ok: false, trace: [stored] }), /changed.*large.js/)
  const committed = { ...stored, ...builderPendingWriteEvidence({ pending: false }) }
  assert.equal(builderEvidenceEvents([committed])[0].outcome, 'mutation_recorded')
  for (const file of ['job-runner.ts', 'repository-repair.ts']) {
    const source = readFileSync('lib/builder/' + file, 'utf8')
    const serializer = source.slice(source.indexOf('function publicTrace'), source.indexOf('function publicTrace') + 3000)
    assert.match(serializer, /builderPendingWriteEvidence\(output\)/)
  }
})
