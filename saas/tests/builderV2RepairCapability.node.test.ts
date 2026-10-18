import test from 'node:test'
import assert from 'node:assert/strict'
import { builderMissingExportStub } from '../lib/builder/agent-v2.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import { BuilderV2Agent } from '../lib/builder/agent-v2.ts'
import { BuilderV2Dispatcher } from '../lib/builder/agent-v2-dispatcher.ts'

test('missing-export stub throws rather than returning false success', () => {
  const source = builderMissingExportStub('createOrders')
  const createOrders = new Function(source + '\nreturn createOrders')()
  assert.throws(() => createOrders(), /builder_stub_not_implemented: createOrders/)
})
test('missing-export stub rejects invalid names', () => {
  assert.throws(() => builderMissingExportStub('x;console.log(1)'), /builder_stub_invalid_identifier/)
})
test('completed file set still requires host verification', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('w', 'package.json', '{"scripts":{"test":"node --test"}}')
  let calls = 0
  const ai = { async generate() { calls++; return JSON.stringify({type:'finish',summary:'done'}) } }
  const dispatcher = new BuilderV2Dispatcher(workspace, { async run() { return { exitCode: 1, stdout: '', stderr: 'tests failed', timedOut: false } } })
  const agent = new BuilderV2Agent(ai, dispatcher, workspace)
  const out = await agent.run({workspaceId:'w',objective:'Create package.json and run npm test',maxSteps:2,modelCallBudget:2})
  assert.notEqual(out.reason, 'verified')
})
