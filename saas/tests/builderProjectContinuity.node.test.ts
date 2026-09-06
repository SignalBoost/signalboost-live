import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { selectBuilderProject } from '../lib/builder/project-continuity.ts'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

const userId = '11111111-1111-4111-8111-111111111111'
const conversationId = '22222222-2222-4222-8222-222222222222'
const workspaceId = '33333333-3333-4333-8333-333333333333'
const job = { id: '44444444-4444-4444-8444-444444444444', userId, conversationId, workspaceId,
  status: 'succeeded', objective: 'Repair total.js and run node total.js', metadata: {},
  result: { files: ['total.js'], trace: [{ toolId: 'run', command: 'node total.js', exitCode: 0 }] } }
const input = { objective: 'Update total.js with one more assertion. Run: node total.js.', userId, conversationId, hasNewSource: false, repositoryImport: false }

test('continued project reads current source, preserves it and produces fresh Node proof', async () => {
  const selected = await selectBuilderProject(input, async target => {
    assert.deepEqual(target, { userId, conversationId }); return job
  })
  assert.equal(selected.workspaceId, workspaceId)
  const workspace = new InMemoryBuilderWorkspace()
  const original = 'const assert = require("node:assert/strict");\nconst total = a => a.reduce((s, n) => s + n, 0);\nassert.equal(total([1, 2, 3]), 6);\nassert.equal(total([]), 0);\nassert.equal(total([-3, 4]), 1);\n'
  await workspace.writeFile(workspaceId, 'total.js', original)
  await workspace.writeFile(workspaceId, 'notes.txt', 'preserve this unrelated file')
  const responses = [
    { type: 'tool', toolId: 'read_file', input: { path: 'total.js' } },
    { type: 'tool', toolId: 'edit_file', input: { path: 'total.js', search: 'assert.equal(total([]), 0);', replace: 'assert.equal(total([]), 0);\nassert.equal(total([10]), 10);' } },
    { type: 'tool', toolId: 'run', input: { command: 'node total.js' } },
  ]
  const directory = await mkdtemp(join(tmpdir(), 'builder-continuity-'))
  let runs = 0
  try {
    const result = await new BuilderToolLoop({ async generate(request) {
      assert.match(request.prompt, /CONTINUING PROJECT/)
      assert.match(request.prompt, /never count earlier command results as current verification/)
      return JSON.stringify(responses.shift() || { type: 'answer', answer: 'Done' })
    } }, workspace, { async run(request) {
      runs++
      for (const file of request.files) await writeFile(join(directory, file.path), file.content)
      return { exitCode: 0, stdout: execFileSync(process.execPath, ['total.js'], { cwd: directory, encoding: 'utf8' }), stderr: '', timedOut: false }
    } }).run({ objective: input.objective, workspaceId: selected.workspaceId!, projectContext: selected.context })
    assert.equal(result.ok, true, JSON.stringify(result))
    assert.equal(runs, 1)
    const source = (await workspace.readFile(workspaceId, 'total.js'))!.content
    for (const line of original.trim().split('\n')) assert.ok(source.includes(line))
    assert.match(source, /total\(\[10\]\)/)
    assert.equal((await workspace.readFile(workspaceId, 'notes.txt'))!.content, 'preserve this unrelated file')
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('new projects, uploads, imports and ordinary questions cannot silently reuse history', async () => {
  for (const request of [
    { ...input, objective: 'Create a new project with total.js' },
    { ...input, objective: 'Update a different app' },
    { ...input, objective: 'Explain total.js' },
    { ...input, hasNewSource: true }, { ...input, repositoryImport: true },
    { ...input, conversationId: null }, { ...input, userId: null },
  ]) assert.deepEqual(await selectBuilderProject(request, async () => { assert.fail('must not read history'); return null }), {})
  assert.deepEqual(await selectBuilderProject({ ...input, objective: 'Add a calendar event' }, async () => job), {})
})

test('history cannot cross owners, conversations or the platform repository boundary', async () => {
  for (const candidate of [
    { ...job, userId: workspaceId }, { ...job, conversationId: workspaceId },
    { ...job, workspaceId: 'invalid' }, { ...job, metadata: { platformRepair: true } },
  ]) assert.deepEqual(await selectBuilderProject(input, async () => candidate), {})
})

test('active jobs and history failures cannot fork an empty replacement project', async () => {
  for (const status of ['queued', 'running', 'paused']) {
    assert.deepEqual(await selectBuilderProject(input, async () => ({ ...job, status })), { blocked: 'busy' })
  }
  assert.deepEqual(await selectBuilderProject(input, async () => { throw new Error('db unavailable') }), { blocked: 'unavailable' })
  assert.equal((await selectBuilderProject(input, async () => ({ ...job, status: 'failed' }))).workspaceId, workspaceId)
})

test('both execution entry points use the server selection and pass history separately from the objective', () => {
  for (const path of ['lib/ai/cos/softwareSpecialist.ts', 'app/api/builder/route.ts']) {
    const source = readFileSync(path, 'utf8')
    assert.match(source, /await selectBuilderProject\(/)
    assert.match(source, /project\.workspaceId/)
    assert.match(source, /projectContext: project\.context/)
    assert.ok(source.indexOf('await selectBuilderProject(') < source.indexOf('await workspace.ensureWorkspace('))
  }
  assert.match(readFileSync('lib/builder/job-runner.ts', 'utf8'), /projectContext: job.metadata.projectContext/)
})

test('continuation history never replaces fail-before/fix/pass proof for an actual repair', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile(workspaceId, 'total.js', 'console.log(1)')
  const actions = [
    { type: 'tool', toolId: 'read_file', input: { path: 'total.js' } },
    { type: 'tool', toolId: 'edit_file', input: { path: 'total.js', search: 'console.log(1)', replace: 'console.log(2)' } },
    { type: 'tool', toolId: 'run', input: { command: 'node total.js' } },
  ]
  const result = await new BuilderToolLoop({ async generate() {
    return JSON.stringify(actions.shift() || { type: 'answer', answer: 'Fixed the bug' })
  } }, workspace, { async run() { return { exitCode: 0, stdout: '2', stderr: '', timedOut: false } } })
    .run({ objective: 'Repair the bug in total.js. Run: node total.js.', workspaceId,
      projectContext: { previousStatus: 'failed', previousCommands: ['node total.js'] }, maxRounds: 10 })
  assert.equal(result.ok, false, 'old failed status is not a failing command in this turn')
})
