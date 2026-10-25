import assert from 'node:assert/strict'
import test from 'node:test'
import { BuilderV2Agent } from '../lib/builder/agent-v2.ts'
import { BuilderV2Dispatcher } from '../lib/builder/agent-v2-dispatcher.ts'
import { runBuilderV2JobCycle, type BuilderV2LeaseStore } from '../lib/builder/agent-v2-job-cycle.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import type { BuilderV2Checkpoint } from '../lib/builder/agent-v2.ts'

test('full harness replay: resume incomplete app, repair failing code and require all final-revision commands', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const objective = [
    'Create these files:',
    '- src/math.js',
    '- test/math.test.js',
    '- index.js',
    '',
    'Run:',
    'npm test',
    'node --test test/*.test.js',
    'node index.js',
    '',
    'Write at least 2 tests.',
  ].join('\n')
  let claimGeneration = 1
  let checkpoint: BuilderV2Checkpoint | null = null
  const store: BuilderV2LeaseStore = {
    async load() { return { workspaceId: 'w', objective, claimGeneration, checkpoint } },
    async save(_job, claim, next) {
      if (claim !== claimGeneration) return false
      checkpoint = next
      return true
    },
  }
  let decisions = 0
  const ai = { async generate() {
    const actions = [
      { type: 'tool', action: { tool: 'write_file', path: 'src/math.js', content: 'module.exports = () => 0\n' } },
      { type: 'tool', action: { tool: 'write_file', path: 'test/math.test.js', content: "const test=require('node:test');test('one',()=>{});test('two',()=>{});\n" } },
      { type: 'tool', action: { tool: 'write_file', path: 'index.js', content: 'console.log(require("./src/math")())\n' } },
      { type: 'tool', action: { tool: 'write_file', path: 'src/math.js', content: 'module.exports = () => 1\n' } },
      { type: 'finish', summary: 'all commands passed' },
    ]
    return JSON.stringify(actions[Math.min(decisions++, actions.length - 1)])
  } }
  const observed: {command: string; fixed: boolean}[] = []
  const runner = { async run({ command, files }: { command: string; files: readonly { path: string; content: string }[] }) {
    const fixed = files.some(file => file.path === 'src/math.js' && file.content.includes('=> 1'))
    observed.push({command, fixed})
    const isTest = command.includes('test')
    return { exitCode: fixed ? 0 : 1, stdout: isTest ? `ℹ tests 2\nℹ pass ${fixed ? 2 : 0}\nℹ fail ${fixed ? 0 : 2}\n` : 'LibraryFlow demo', stderr: '', timedOut: false }
  } }
  const agent = new BuilderV2Agent(ai, new BuilderV2Dispatcher(workspace, runner), workspace)
  const first = await runBuilderV2JobCycle({ jobId: 'j', claimGeneration, store, agent, maxSteps: 2 })
  assert.equal(first.status, 'paused')
  assert.ok(checkpoint)
  claimGeneration++
  const second = await runBuilderV2JobCycle({ jobId: 'j', claimGeneration, store, agent, maxSteps: 15 })
  assert.equal(second.status, 'verified')
  assert.ok(observed.some(run => !run.fixed && run.command === 'npm test'), 'the defective revision must fail')
  for (const command of ['npm test', 'node --test test/*.test.js', 'node index.js']) {
    assert.ok(observed.some(run => run.fixed && run.command === command), command)
  }
})
