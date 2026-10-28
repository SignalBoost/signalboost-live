// saas/tests/builderRepositoryDurableEdits.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../lib/builder/repository-repair.ts', import.meta.url), 'utf8')

test('repository repair persists each completed edit and replays the copies when a later slice resumes', () => {
  assert.match(source, /const durableSession = new Proxy\(session, \{/)
  assert.match(source, /key === 'writeFile' \|\| key === 'editFile'/)
  assert.match(source, /await workspace\.writeFile\(input\.workspaceId, repositoryEditCopyPath\(result\.path\), result\.content\)/)
  assert.match(source, /editedPaths\.add\(result\.path\)/)
  assert.match(source, /proofController\?\.workspace \?\? durableSession/)
  assert.match(source, /workspace: durableSession/)
  assert.match(source, /if \(resumeState\) \{\s*await restoreRepositoryRepairCheckout\(/)
})
