// saas/tests/builderV2TruncatedReplies.node.test.ts
// Production 2026-10-16: OrderFlow on V2 wrote 7 of 15 files, then a batched reply hit the 4096-token output
// limit and the model client discarded it (local_model_output_truncated), ending the job.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BuilderV2Agent } from '../lib/builder/agent-v2.ts'
import { BuilderV2Dispatcher } from '../lib/builder/agent-v2-dispatcher.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

const objective = 'Build app.\nCreate all 2 files:\n```text\napp/\n├── index.js\n└── src/\n    └── a.js\n```\n## Mandatory verification\nExecute all one commands:\n```bash\nnode index.js\n```'
const passing = { async run() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false } } }

test('V2 asks the model client to keep a cut-off reply, and salvages its complete actions', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const requests: { allowTruncatedText?: boolean }[] = []
  const full = JSON.stringify({ type: 'tools', actions: [
    { tool: 'write_file', path: 'src/a.js', content: 'module.exports = 1\n' },
    { tool: 'write_file', path: 'index.js', content: "require('./src/a.js')\n" },
  ] })
  const cut = full.slice(0, full.indexOf('"index.js"') + 20)
  const replies = [cut, JSON.stringify({ type: 'tool', action: { tool: 'write_file', path: 'index.js', content: "require('./src/a.js')\n" } })]
  let at = 0
  const outcome = await new BuilderV2Agent({ async generate(request) { requests.push(request); return replies[at++] ?? null } },
    new BuilderV2Dispatcher(workspace, passing), workspace).run({ workspaceId: 't', objective, maxSteps: 4 })
  assert.ok(requests.every(request => request.allowTruncatedText === true))
  assert.equal(outcome.ok, true, outcome.reason)
  assert.equal((await workspace.readFile('t', 'src/a.js'))?.content, 'module.exports = 1\n')
})

test('a reply cut off before any complete action is feedback to send less, not the end of the job', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const prompts: string[] = []
  let call = 0
  const ai = { async generate(request: { prompt: string }) {
    prompts.push(request.prompt)
    if (call++ === 0) throw new Error('local_model_output_truncated')
    return JSON.stringify({ type: 'tools', actions: [
      { tool: 'write_file', path: 'src/a.js', content: 'module.exports = 1\n' },
      { tool: 'write_file', path: 'index.js', content: "require('./src/a.js')\n" },
    ] })
  } }
  const outcome = await new BuilderV2Agent(ai, new BuilderV2Dispatcher(workspace, passing), workspace)
    .run({ workspaceId: 'e', objective, maxSteps: 4 })
  assert.equal(outcome.ok, true, outcome.reason)
  assert.match(prompts[1], /builder_v2_reply_truncated/)
})

test('the Builder model client passes allowTruncatedText to the RunPod primary and the local fallback', () => {
  const port = readFileSync(new URL('../lib/cos/aiPort.ts', import.meta.url), 'utf8')
  const coding = port.slice(port.indexOf('export function createBuilderCodingAiPort'))
  assert.equal(coding.match(/allowTruncatedText: input\.allowTruncatedText === true/g)?.length, 2)
  // The prompt budget now fits the 4096-token output limit.
  const agent = readFileSync(new URL('../lib/builder/agent-v2.ts', import.meta.url), 'utf8')
  assert.match(agent, /up to 4 actions and about 8000 characters per reply/)
})
