// saas/tests/builderVerifiedTaskLoop.node.test.ts
// The shared verified task loop (owner direction 2026-10-26): write one file, run the check in the sandbox, feed the
// real failure back, at most three attempts, open early on a repeated failure. Used by Builder single-file jobs and
// by COS chat when its planner names one file and the command that proves it.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  VERIFIED_TASK_MAX_ATTEMPTS,
  parseVerifiedTaskEdit,
  runVerifiedTaskLoop,
  verifiedTaskEditablePaths,
  verifiedTaskFailureReport,
} from '../lib/builder/verified-task-loop.ts'

type File = { path: string; content: string; updatedAt: number }

function workspace(initial: Record<string, string> = {}) {
  const files = new Map<string, File>(Object.entries(initial).map(([path, content]) => [path, { path, content, updatedAt: 1 }]))
  const writes: string[] = []
  return {
    writes, files,
    port: {
      listFiles: async () => [...files.values()].map(({ path, updatedAt }) => ({ path, updatedAt })),
      readFile: async (_: string, path: string) => files.get(path) ?? null,
      writeFile: async (_: string, path: string, content: string) => { writes.push(path); const file = { path, content, updatedAt: 2 }; files.set(path, file); return file },
      editFile: async () => { throw new Error('not used') },
    },
  }
}

/** A model that answers each attempt from a script and records what it was shown. */
function model(replies: string[]) {
  const prompts: string[] = []
  return { prompts, port: { generate: async (request: { prompt: string }) => { prompts.push(request.prompt); return replies.shift() ?? null } } }
}

/** A sandbox that passes when the file under test contains `pass`, and records every run. */
function sandbox(target: string, exit = (content: string) => content.includes('pass') ? 0 : 1, output = (content: string) => `ran with ${content.length} chars`) {
  const runs: { command: string; files: string[] }[] = []
  return {
    runs,
    port: {
      run: async (input: { command: string; files: readonly { path: string; content: string }[] }) => {
        runs.push({ command: input.command, files: input.files.map(file => file.path) })
        const content = input.files.find(file => file.path === target)?.content ?? ''
        const code = exit(content)
        return { exitCode: code, stdout: code === 0 ? 'ok 1 - typed query' : '', stderr: code === 0 ? '' : `TS2322 ${output(content)}`, timedOut: false }
      },
    },
  }
}

const edit = (path: string, content: string) => JSON.stringify({ path, content })
const base = { task: 'Create a TypeScript Supabase client helper with a typed query function.', workspaceId: 'w', verifyCommand: 'node --test test/client.test.ts' }

test('a passing first attempt is written to the workspace with its real verification output', async () => {
  const ws = workspace({ 'test/client.test.ts': 'assert(query)' })
  const ai = model([edit('lib/client.ts', 'export const pass = 1')])
  const box = sandbox('lib/client.ts')
  const result = await runVerifiedTaskLoop({ ...base, editablePaths: ['lib/client.ts'], ports: { ai: ai.port, runner: box.port, workspace: ws.port } })
  assert.equal(result.ok, true)
  assert.equal(result.stopped, 'verified')
  assert.deepEqual(ws.writes, ['lib/client.ts'])
  assert.equal(box.runs[0].command, base.verifyCommand)
  assert.deepEqual(box.runs[0].files.sort(), ['lib/client.ts', 'test/client.test.ts'])
  assert.match(result.ok ? result.answer : '', /exited 0 in the sandbox[\s\S]*ok 1 - typed query/)
})

test('a failure\'s real output is fed back, and the next attempt fixes it', async () => {
  const ws = workspace()
  const ai = model([edit('lib/client.ts', 'broken'), edit('lib/client.ts', 'export const pass = 2')])
  const result = await runVerifiedTaskLoop({ ...base, editablePaths: ['lib/client.ts'], ports: { ai: ai.port, runner: sandbox('lib/client.ts').port, workspace: ws.port } })
  assert.equal(result.stopped, 'verified')
  assert.equal(result.attempts.length, 2)
  assert.doesNotMatch(ai.prompts[0], /EARLIER ATTEMPTS/)
  assert.match(ai.prompts[1], /EARLIER ATTEMPTS AND THEIR REAL OUTPUT[\s\S]*TS2322 ran with 6 chars/)
})

test('the circuit breaker stops after three attempts and leaves the workspace unchanged', async () => {
  const ws = workspace({ 'lib/client.ts': 'original' })
  let n = 0
  const ai = { generate: async () => edit('lib/client.ts', `try ${'x'.repeat(++n)}`) }
  const result = await runVerifiedTaskLoop({ ...base, editablePaths: ['lib/client.ts'], ports: { ai, runner: sandbox('lib/client.ts').port, workspace: ws.port } })
  assert.equal(VERIFIED_TASK_MAX_ATTEMPTS, 3)
  assert.equal(result.ok, false)
  assert.equal(result.stopped, 'circuit_open_max_attempts')
  // The check ran once before any change (attempt 0), then three changes were tried.
  assert.deepEqual(result.attempts.map(item => item.attempt), [0, 1, 2, 3])
  assert.deepEqual(ws.writes, [])
  assert.equal(ws.files.get('lib/client.ts')?.content, 'original')
  // A caller cannot raise the breaker above three.
  const again = await runVerifiedTaskLoop({ ...base, maxAttempts: 10, editablePaths: ['lib/client.ts'], ports: { ai, runner: sandbox('lib/client.ts').port, workspace: workspace().port } })
  assert.equal(again.attempts.length, 3)
})

test('observe first: an existing file whose check already passes is left alone, with no model call', async () => {
  const ws = workspace({ 'lib/client.ts': 'export const pass = 0' })
  const ai = model([])
  const box = sandbox('lib/client.ts')
  const result = await runVerifiedTaskLoop({ ...base, editablePaths: ['lib/client.ts'], ports: { ai: ai.port, runner: box.port, workspace: ws.port } })
  assert.equal(result.ok, true)
  assert.equal(ai.prompts.length, 0)
  assert.equal(box.runs.length, 1)
  assert.deepEqual(ws.writes, [])
})

test('observe first: an existing file\'s real failure is what the first attempt is shown', async () => {
  const ws = workspace({ 'lib/client.ts': 'broken' })
  const ai = model([edit('lib/client.ts', 'export const pass = 3')])
  const result = await runVerifiedTaskLoop({ ...base, editablePaths: ['lib/client.ts'], ports: { ai: ai.port, runner: sandbox('lib/client.ts').port, workspace: ws.port } })
  assert.equal(result.stopped, 'verified')
  assert.match(ai.prompts[0], /"attempt": 0[\s\S]*TS2322 ran with 6 chars/)
})

test('the same failure twice in a row opens the breaker early', async () => {
  const ai = { generate: async () => edit('lib/client.ts', 'same broken content') }
  const result = await runVerifiedTaskLoop({ ...base, editablePaths: ['lib/client.ts'], ports: { ai, runner: sandbox('lib/client.ts').port, workspace: workspace().port } })
  assert.equal(result.stopped, 'circuit_open_repeated_failure')
  assert.equal(result.attempts.length, 2)
  assert.match(verifiedTaskFailureReport(result, base.verifyCommand), /files were left unchanged[\s\S]*two attempts failed in exactly the same way/)
})

test('a test file can never be the file the loop changes', async () => {
  assert.deepEqual(verifiedTaskEditablePaths(['lib/client.ts', 'test/client.test.ts', 'src/a.spec.ts', '../etc/passwd', 'lib/client.ts']), ['lib/client.ts'])
  assert.equal(parseVerifiedTaskEdit(edit('test/client.test.ts', 'pass'), ['lib/client.ts']), null)
  const ai = model([edit('test/client.test.ts', 'assert(true) // pass'), edit('test/client.test.ts', 'pass'), edit('test/client.test.ts', 'pass')])
  const box = sandbox('lib/client.ts')
  const result = await runVerifiedTaskLoop({ ...base, editablePaths: ['lib/client.ts', 'test/client.test.ts'], ports: { ai: ai.port, runner: box.port, workspace: workspace().port } })
  assert.equal(result.ok, false)
  assert.equal(result.stopped, 'no_usable_output')
  assert.equal(box.runs.length, 0, 'nothing runs for a reply that tries to change the test')
})

test('replies that are not the agreed JSON never run and never count as a pass', () => {
  assert.equal(parseVerifiedTaskEdit('Here is the code: export const x = 1', ['a.ts']), null)
  assert.equal(parseVerifiedTaskEdit('{"path":"a.ts","content":"   "}', ['a.ts']), null)
  assert.deepEqual(parseVerifiedTaskEdit('```json\n{"path":"a.ts","content":"x"}\n```', ['a.ts']), { path: 'a.ts', content: 'x' })
})

test('Builder single-file jobs and COS chat both run this loop; neither is refused as retired', () => {
  const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  const single = runner.indexOf('const singleFile = debugPlan(job)')
  assert.ok(single > 0 && single < runner.indexOf("terminalFailure(job, 'builder_v1_retired_use_v2')"))
  assert.match(runner, /runVerifiedTaskLoop\(\{[\s\S]*ports: \{ ai, runner: new VercelSandboxBuilderRunner\(\), workspace \}/)
  assert.doesNotMatch(runner, /runDebugFileJob/)
  const specialist = readFileSync(new URL('../lib/ai/cos/softwareSpecialist.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(specialist, /Legacy Builder debug mode is retired/)
  assert.match(specialist, /verifiedTaskPlan\(input\.verifiedTask\) \?\? planDebugFileJob\(objective, stagedFiles\)/)
  const route = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(route, /builder_v1_debug_mode_retired_use_v2/)
  const browser = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  assert.equal(browser.match(/verifiedTask: agentDecision\.verifiedTask \?\? null,/g)?.length, 3)
})

test('the planner\'s file and command become a single-file plan only when both are real', async () => {
  const { verifiedTaskFromToolArguments } = await import('../lib/ai/cos/cosAgentDecision.ts')
  assert.deepEqual(verifiedTaskFromToolArguments('{"targetPath":"lib/client.ts","verifyCommand":"node --test"}'), { targetPath: 'lib/client.ts', verifyCommand: 'node --test' })
  assert.equal(verifiedTaskFromToolArguments('{"targetPath":"lib/client.ts"}'), null)
  assert.equal(verifiedTaskFromToolArguments('not json'), null)
})
