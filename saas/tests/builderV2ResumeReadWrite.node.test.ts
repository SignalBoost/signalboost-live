// saas/tests/builderV2ResumeReadWrite.node.test.ts
// Production 2026-10-22 (workspace 3423e8b5…): after a failed npm test the model read src/cart.js, the slice paused,
// and on resume the read was remembered as "already done" (repeating it is refused) while the content it saw was
// forgotten (overwriting an unread file is refused). The model could neither re-read nor rewrite the file; three
// slices passed without a change and the job ended in builder_v2_continuation_no_progress.
import test from 'node:test'
import assert from 'node:assert/strict'
import { BuilderV2Agent } from '../lib/builder/agent-v2.ts'
import { BuilderV2Dispatcher } from '../lib/builder/agent-v2-dispatcher.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import type { BuilderRunnerPort } from '../lib/builder/contracts.ts'

const tool = (action: Record<string, unknown>) => JSON.stringify({ type: 'tool', action })
const scripted = (replies: string[]) => {
  let at = 0
  return { calls: () => at, ai: { async generate() { return replies[at++] ?? null } } }
}
const idle: BuilderRunnerPort = { async run() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false } } }

test('a file read before a pause can be rewritten after resume, without a refused re-read', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('w', 'src/cart.js', 'module.exports = { getTotal: () => 0 }\n')
  const objective = 'Fix src/cart.js so getTotal returns the cart total.'
  const first = scripted([tool({ tool: 'read_file', path: 'src/cart.js' })])
  const sliceOne = await new BuilderV2Agent(first.ai, new BuilderV2Dispatcher(workspace, idle), workspace)
    .run({ workspaceId: 'w', objective, maxSteps: 1 })
  assert.ok(sliceOne.checkpoint, 'the slice pauses with its checkpoint')

  const fixed = 'module.exports = { getTotal: items => items.reduce((sum, item) => sum + item.price * item.qty, 0) }\n'
  const second = scripted([tool({ tool: 'write_file', path: 'src/cart.js', content: fixed })])
  const sliceTwo = await new BuilderV2Agent(second.ai, new BuilderV2Dispatcher(workspace, idle), workspace)
    .run({ workspaceId: 'w', objective, maxSteps: 1, checkpoint: sliceOne.checkpoint })
  assert.equal((await workspace.readFile('w', 'src/cart.js'))?.content, fixed)
  assert.equal(sliceTwo.checkpoint?.steps.at(-1)?.changed, true)
})

test('a read whose content was not kept may be repeated after resume', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('w', 'src/cart.js', 'module.exports = {}\n')
  const objective = 'Fix src/cart.js.'
  const sliceOne = await new BuilderV2Agent(scripted([tool({ tool: 'read_file', path: 'src/cart.js' })]).ai,
    new BuilderV2Dispatcher(workspace, idle), workspace).run({ workspaceId: 'w', objective, maxSteps: 1 })
  const checkpoint = { ...sliceOne.checkpoint!, steps: sliceOne.checkpoint!.steps.map(step => step.tool === 'read_file'
    ? { ...step, output: { path: 'src/cart.js' } } : step) }
  const sliceTwo = await new BuilderV2Agent(scripted([tool({ tool: 'read_file', path: 'src/cart.js' })]).ai,
    new BuilderV2Dispatcher(workspace, idle), workspace).run({ workspaceId: 'w', objective, maxSteps: 1, checkpoint })
  assert.equal(sliceTwo.checkpoint?.steps.length, 2, 'the re-read ran instead of being refused as a repeat')
})
