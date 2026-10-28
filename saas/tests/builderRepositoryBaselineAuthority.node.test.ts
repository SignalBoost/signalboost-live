// saas/tests/builderRepositoryBaselineAuthority.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRepositoryRepairProofController } from '../lib/builder/repository-repair-proof-controller.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

test('a selected failing command is not permission to change source before the host reproduces it', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('ws', 'src/main.ts', 'export const answer = 1')
  let runs = 0
  const controller = createRepositoryRepairProofController({
    workspace,
    runner: { async run() { runs++; return { exitCode: 1, stdout: '', stderr: 'AssertionError', timedOut: false } } },
    proofCommand: 'node --test tests/main.test.ts',
  })
  await assert.rejects(controller.workspace.editFile('ws', 'src/main.ts', '1', '2'), /builder_regression_proof_required_before_source_edit/)
  assert.equal((await workspace.readFile('ws', 'src/main.ts'))?.content, 'export const answer = 1')
  const baseline = await controller.baseline('ws')
  assert.equal(baseline.state, 'failed')
  assert.equal(baseline.result?.exitCode, 1)
  assert.equal(runs, 1)
  await controller.workspace.editFile('ws', 'src/main.ts', '1', '2')
  assert.equal((await workspace.readFile('ws', 'src/main.ts'))?.content, 'export const answer = 2')
})

test('a passing baseline does not authorize source mutation', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('ws', 'src/main.ts', 'export const answer = 1')
  const controller = createRepositoryRepairProofController({
    workspace,
    runner: { async run() { return { exitCode: 0, stdout: 'pass', stderr: '', timedOut: false } } },
    proofCommand: 'node --test tests/main.test.ts',
  })
  assert.equal((await controller.baseline('ws')).state, 'passed')
  await assert.rejects(controller.workspace.editFile('ws', 'src/main.ts', '1', '2'), /builder_regression_proof_required_before_source_edit/)
})
