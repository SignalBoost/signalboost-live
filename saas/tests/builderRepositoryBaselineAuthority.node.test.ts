import test from 'node:test'
import assert from 'node:assert/strict'
import { createRepositoryRepairProofController } from '../lib/builder/repository-repair-proof-controller.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

test('a selected failing command is not permission to change source before host reproduction', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('ws', 'src/main.ts', 'export const answer = 1')
  let runs = 0
  const controller = createRepositoryRepairProofController({
    ai: { async generate() { return '{"type":"answer","answer":"done"}' } },
    workspace,
    runner: { async run() { runs++; return { exitCode: 1, stdout: '', stderr: 'AssertionError', timedOut: false } } },
    proofCommand: 'node --test tests/main.test.ts',
  })
  await assert.rejects(controller.workspace.editFile('ws', 'src/main.ts', '1', '2'), /builder_regression_proof_required_before_source_edit/)
  assert.equal((await workspace.readFile('ws', 'src/main.ts'))?.content, 'export const answer = 1')
  const first = await controller.ai.generate({ systemPrompt: 's', prompt: 'p', maxTokens: 100 })
  assert.match(first || '', /node --test tests\/main.test.ts/)
  const baseline = await controller.runner.run({ workspaceId: 'ws', command: 'node --test tests/main.test.ts', files: [] })
  assert.equal(baseline.exitCode, 1)
  assert.equal(runs, 1)
  await controller.workspace.editFile('ws', 'src/main.ts', '1', '2')
  assert.equal((await workspace.readFile('ws', 'src/main.ts'))?.content, 'export const answer = 2')
  await assert.rejects(controller.workspace.editFile('ws', 'src/main.ts', '2', '3'), /builder_regression_proof_required_before_source_edit/)
  await controller.runner.run({ workspaceId: 'ws', command: 'node --test tests/main.test.ts', files: [] })
  await controller.workspace.editFile('ws', 'src/main.ts', '2', '3')
})

test('a passing baseline does not authorize source mutation', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('ws', 'src/main.ts', 'export const answer = 1')
  const controller = createRepositoryRepairProofController({
    ai: { async generate() { throw Error('must not invoke model') } },
    workspace,
    runner: { async run() { return { exitCode: 0, stdout: 'pass', stderr: '', timedOut: false } } },
    proofCommand: 'node --test tests/main.test.ts',
  })
  await controller.runner.run({ workspaceId: 'ws', command: 'node --test tests/main.test.ts', files: [] })
  await assert.rejects(controller.workspace.editFile('ws', 'src/main.ts', '1', '2'), /builder_regression_proof_required_before_source_edit/)
  await assert.rejects(controller.ai.generate({ systemPrompt: 's', prompt: 'p', maxTokens: 100 }), /builder_regression_not_reproduced/)
})
