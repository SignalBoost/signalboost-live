// saas/tests/builderOwnerRepairWithoutSource.node.test.ts
//
// Production 2026-10-13: an owner repair request with nothing attached ended "I have the repair request, but no
// source files to inspect" (builder_source_required). Only phrasings like "fix the builder, it is broken" reached the
// platform repository; "Repair lib/ai/cos/powerStabilizationRelease.ts ..." named the file and still dead-ended in an
// empty workspace. An owner repair with no source anywhere now goes to the repository at the deployed revision.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { hasWorkspaceSource, isOwnerRepairWithoutSource, signalBoostDeployedRepairTarget } from '../lib/builder/repository-repair-target.ts'

const DEPLOYED = { commitSha: 'a'.repeat(40), branch: 'main' }
const OWNER_REPAIRS = [
  'Fix the power stabilization release gate so the advisory diagnosis answer is correct.',
  'Repair lib/ai/cos/powerStabilizationRelease.ts: the gate lets ranked levers through.',
  'The concierge answers the wrong language, fix it',
  'Fix the builder, it is broken',
]
const noSource = { isOwner: true, hasAttachedSource: false, hasRepositoryImport: false, workspaceHasFiles: false, hasProjectContext: false }

// What the Builder route does for an owner with no source: the explicit platform target, else the owner fallback.
function routedToRepository(objective: string, context = noSource): boolean {
  if (signalBoostDeployedRepairTarget(objective, DEPLOYED)) return true
  return isOwnerRepairWithoutSource({ objective, ...context })
    && Boolean(signalBoostDeployedRepairTarget(objective, DEPLOYED, { ownerRepairWithoutSource: true }))
}

for (const objective of OWNER_REPAIRS) {
  test(`owner repair with no source reaches the platform repository: ${objective}`, () => {
    assert.equal(routedToRepository(objective), true)
  })
}

test('the repository target pins the deployed revision and keeps the named file as a hint', () => {
  const target = signalBoostDeployedRepairTarget(OWNER_REPAIRS[1], DEPLOYED, { ownerRepairWithoutSource: true })
  assert.ok(target)
  assert.equal(target.commitSha, DEPLOYED.commitSha)
  assert.equal(target.trigger, 'deployed_platform_objective')
  assert.ok(target.pathHints.includes('saas/lib/ai/cos/powerStabilizationRelease.ts'), JSON.stringify(target.pathHints))
})

test('any source of its own keeps the request in the user workspace', () => {
  const objective = OWNER_REPAIRS[0]
  for (const key of ['hasAttachedSource', 'hasRepositoryImport', 'workspaceHasFiles', 'hasProjectContext'] as const) {
    assert.equal(isOwnerRepairWithoutSource({ objective, ...noSource, [key]: true }), false, key)
  }
})

test('non-owners and creation requests are unaffected', () => {
  assert.equal(isOwnerRepairWithoutSource({ objective: OWNER_REPAIRS[0], ...noSource, isOwner: false }), false)
  assert.equal(isOwnerRepairWithoutSource({ objective: 'Build a CLI that converts CSV to JSON, with tests.', ...noSource }), false)
})

test('without a pinned deployed revision nothing is routed', () => {
  assert.equal(signalBoostDeployedRepairTarget(OWNER_REPAIRS[0], { commitSha: '', branch: 'main' }, { ownerRepairWithoutSource: true }), null)
})

test('the Builder route applies the owner fallback before the empty-workspace path', () => {
  const route = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
  const fallback = route.indexOf('isOwnerRepairWithoutSource({')
  const enqueueStandard = route.indexOf('await enqueueBuilderJob({')
  assert.ok(fallback > 0 && fallback < enqueueStandard, 'fallback runs before a standard job is queued')
  assert.match(route, /ownerRepairWithoutSource: true/)
  assert.match(route, /hasWorkspaceSource\(listed\.map\(file => file\.path\)\), \(\) => true/, 'a storage failure never reroutes a workspace of unknown contents')
})
// Production 2026-10-13 (workspace 502c0aa8): the retry reused the workspace of the dead-ended run, whose only file
// was Builder's own builder-result.txt. That counted as source, so the request stayed in the empty-workspace path.
test("Builder's own result report is not source", () => {
  assert.equal(hasWorkspaceSource([]), false)
  assert.equal(hasWorkspaceSource(['builder-result.txt']), false)
  assert.equal(hasWorkspaceSource(['builder-result.txt', 'src/parser.ts']), true)
  assert.equal(hasWorkspaceSource(['notes/builder-result.txt']), true, 'only the workspace-root report is Builder output')
})

test('an isolated new application is never converted to a SignalBoost platform repair', () => {
  const objective = [
    'Build a complete working Node.js order management application called OrderFlow, from scratch, in a new isolated workspace.',
    'Create products, shopping carts, orders, persistence, and 30 independent automated tests.',
    'If a test fails, fix the relevant source and rerun it.',
    'Do not modify the iTMounts platform repository. This is an isolated Builder workspace evaluation.',
  ].join('\n')
  assert.equal(routedToRepository(objective), false)
  assert.equal(isOwnerRepairWithoutSource({ objective, ...noSource }), false)
  assert.equal(signalBoostDeployedRepairTarget(objective, DEPLOYED, { ownerRepairWithoutSource: true }), null)
  assert.equal(routedToRepository('Fix the Builder platform because it is broken'), true)
})

// end of saas/tests/builderOwnerRepairWithoutSource.node.test.ts (if this line is missing, the paste was cut short)
