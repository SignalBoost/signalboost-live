// saas/tests/builderNewSpecificationProject.node.test.ts
// Production 2026-10-16, job e98aa467: the OrderFlow acceptance specification pasted again in the same conversation
// inherited the previous job's workspace and project context, so it ran on the legacy engine over stale files.
// A complete new-application specification is a new project: fresh workspace, no inherited context, Builder V2.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isNewBuilderProjectObjective, selectBuilderProject } from '../lib/builder/project-continuity.ts'

const spec = readFileSync(new URL('./fixtures/builder-orderflow-acceptance-request.md', import.meta.url), 'utf8')
  .replace(/^<!--.*-->\n/, '')
const userId = '11111111-1111-4111-8111-111111111111'
const conversationId = '22222222-2222-4222-8222-222222222222'
const previousWorkspace = '33333333-3333-4333-8333-333333333333'
const previousJob = { id: '44444444-4444-4444-8444-444444444444', userId, conversationId, workspaceId: previousWorkspace,
  status: 'failed', objective: spec, metadata: {}, result: { files: ['package.json'], trace: [] } }

test('the production OrderFlow specification is a new project', () => {
  assert.equal(isNewBuilderProjectObjective(spec), true)
})

test('a whole project without a package manifest is a new project too (Codex review on #4642)', () => {
  assert.equal(isNewBuilderProjectObjective('# Portfolio\nBuild a complete responsive portfolio website.\nCreate all 3 files:\n- index.html\n- styles.css\n- script.js'), true)
})

test('extending an existing application stays a continuation', () => {
  for (const objective of [
    'Add a discounts feature to the existing OrderFlow application. Create src/discounts.js and test/discounts.test.js, then run npm test.',
    'Update src/orders.js so cancelled orders keep their timestamps. Run npm test.',
    'Fix the failing test in test/orders.test.js',
    // Codex review on #4639: a feature with its own file list is not a new application.
    'Implement order cancellation.\nCreate all 2 files:\n- src/cancel.js\n- test/cancel.test.js',
    'Implement order cancellation. Create all 2 files: src/cancel.js and test/cancel.test.js',
    'Create a settings page for our app.\nCreate all 2 files:\n- src/settings.js\n- test/settings.test.js',
    'Build a reports feature.\nCreate all 2 files:\n- src/reports.js\n- test/reports.test.js',
  ]) assert.equal(isNewBuilderProjectObjective(objective), false, objective)
})

test('a new specification in a conversation with a previous job inherits neither its workspace nor its context', async () => {
  let lookups = 0
  const selected = await selectBuilderProject({ objective: spec, userId, conversationId, requestedWorkspaceId: previousWorkspace,
    hasNewSource: false, repositoryImport: false }, async () => { lookups++; return previousJob })
  assert.deepEqual(selected, {})
  assert.equal(lookups, 0)
})

test('a follow-up in the same conversation still continues the previous project', async () => {
  const selected = await selectBuilderProject({ objective: 'Update src/orders.js so cancelled orders keep their timestamps. Run npm test.',
    userId, conversationId, hasNewSource: false, repositoryImport: false }, async () => previousJob)
  assert.equal(selected.workspaceId, previousWorkspace)
  assert.equal(selected.context?.previousJobId, previousJob.id)
})

test('the route gives a new project a fresh workspace and Builder V2 even when the browser sent its last workspace', () => {
  const route = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
  assert.match(route, /const selectedWorkspaceId = newProjectRequested \? '' : requestedWorkspaceId/)
  assert.match(route, /let workspaceId = selectedWorkspaceId \|\| crypto\.randomUUID\(\)/)
  assert.match(route, /requestedWorkspaceId: selectedWorkspaceId \|\| undefined,/)
  assert.match(route, /builderEngine: 'v2'/)
  // The raw browser value is only parsed and validated; every routing decision uses the effective selection.
  assert.equal(route.match(/\brequestedWorkspaceId\b/g)!.length, 5)
})

test('the shared Software Specialist surface applies the same new-project rule (Codex review on #4639)', () => {
  const surface = readFileSync(new URL('../lib/ai/cos/softwareSpecialist.ts', import.meta.url), 'utf8')
  assert.match(surface, /const selectionBody = newProject \? \{\} : input\.body/)
  assert.match(surface, /requestedWorkspaceId: String\(selectionBody\?\.workspaceId \|\| selectionBody\?\.context\?\.workspaceId \|\| ''\)/)
  assert.match(surface, /const workspaceId = project\.workspaceId \|\| workspaceIdFrom\(selectionBody\)/)
  assert.match(surface, /builderEngine: 'v2'/)
  assert.doesNotMatch(surface, /workspaceIdFrom\(input\.body\)/)
})

test('V2 route accepts an owned prior workspace and retains strict source checks', () => {
  const route = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(route, /if \(selectedWorkspaceId \|\| project\.context\)\s*\{\s*return noStore\(\{ error: 'builder_v2_requires_fresh_workspace'/)
  assert.match(route, /const continuationWorkspace = !newProjectRequested/)
  assert.match(route, /await workspace\.hasWorkspace\(workspaceId\)/)
  assert.match(route, /await workspace\.listFiles\(workspaceId\)/)
  assert.match(route, /requiresExistingSource: true/)
})
