import test from 'node:test'
import assert from 'node:assert/strict'
import { formatVerifiedLessonsForPrompt } from '../lib/builder/verified-lessons.ts'
import type { BuilderVerifiedRepairLesson } from '../lib/builder/contracts.ts'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

// A stored lesson as it reaches the loop: a failure class proven repaired in the fixed runtime.
const lesson: BuilderVerifiedRepairLesson = Object.freeze({ failureClass: 'test', causeEvidence: 'AssertionError: private error',
  fixSummary: 'UNTRUSTED MODEL SUMMARY', regressionCommand: 'node --test verify.js', runtime: 'node24-network-denied-ephemeral' })

test('the inference loop receives matching history only after observing its own failure', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('project', 'app.js', 'module.exports = 1')
  const prompts: string[] = []
  const actions = [ { type: 'tool', toolId: 'run', input: { command: 'node app.js' } },
    { type: 'tool', toolId: 'edit_file', input: { path: 'app.js', search: '= 1', replace: '= 2' } },
    { type: 'tool', toolId: 'run', input: { command: 'node app.js' } } ]
  let runs = 0
  const ai = { async generate(input: { prompt: string }) { prompts.push(input.prompt); return JSON.stringify(actions.shift() || { type: 'answer', answer: 'Verified.' }) } }
  const runner = { async run() { return { exitCode: runs++ ? 0 : 1, stdout: '', stderr: runs === 1 ? 'AssertionError: wrong value' : '', timedOut: false } } }
  const completed = await new BuilderToolLoop(ai, workspace, runner).run({ objective: 'Fix app.js. Run: node app.js', workspaceId: 'project', priorLessons: [lesson] })
  assert.equal(completed.ok, true)
  assert.doesNotMatch(prompts[0], /PRIOR VERIFIED REPAIR HISTORY/)
  assert.ok(prompts.slice(1).some(prompt => /PRIOR VERIFIED REPAIR HISTORY/.test(prompt)))
  assert.ok(prompts.every(prompt => !/private error|UNTRUSTED MODEL SUMMARY/.test(prompt)))
})

test('lesson prompts surface only a matching failure class and never retain model prose, raw errors or commands', () => {
  assert.equal(formatVerifiedLessonsForPrompt([lesson], null), '')
  assert.equal(formatVerifiedLessonsForPrompt([lesson], 'dependency'), '')
  assert.match(formatVerifiedLessonsForPrompt([lesson], 'test'), /prior test repair/)
  assert.doesNotMatch(formatVerifiedLessonsForPrompt([lesson], 'test'), /private error|UNTRUSTED|verify.js/)
})
