import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const route = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')

test('confirmed-empty selected workspace is rejected before enqueue with HTTP 400', () => {
  const guard = route.indexOf('if (!project.context && !hasWorkspaceSource(listed.map(file => file.path)))')
  const enqueue = route.indexOf('await enqueueBuilderJob(')
  assert.ok(guard > 0 && enqueue > guard)
  assert.match(route, /Selected workspace is empty\. Choose the original project or connect\/import the repository\. No job was created\./)
  assert.match(route.slice(guard, guard + 350), /status: 400/)
})

test('continuation history may still rescue a transiently empty listing', () => {
  assert.match(route, /!project\.context && !hasWorkspaceSource/)
  assert.match(route, /Unable to verify selected workspace source files\. No job was created\./)
  assert.match(route, /status: 503/)
  assert.match(route, /if \(repositoryTarget\) \{[\s\S]*?importBuilderRepository\(repositoryTarget\)/)
})

test('production 2026-10-16: a complete new-application spec builds into an empty selected workspace', async () => {
  assert.match(route, /const creationSpecification = opensWithCreationDirective\(objective\) && builderTaskContract\(objective\)\.files\.length >= 2/)
  // Codex review on #4585: the worker must not require existing source either, or the job fails asynchronously.
  assert.match(route, /const continuationWorkspace = !newProjectRequested && !creationSpecification && /)
  const requires = [...route.matchAll(/\.\.\.\(continuationWorkspace \? \{ requiresExistingSource: true \} : \{\}\)/g)]
  assert.equal(requires.length, 2)
  assert.ok(route.indexOf('const creationSpecification') < route.indexOf('const continuationWorkspace'))
  const { opensWithCreationDirective } = await import('../lib/builder/regression-gate.ts')
  const { builderTaskContract } = await import('../lib/builder/task-contract.ts')
  const spec = (objective: string) => opensWithCreationDirective(objective) && builderTaskContract(objective).files.length >= 2
  const orderflow = ['# OrderFlow', '## Objective', 'Build a complete, working OrderFlow application using Node.js.', '## Required project structure', 'Create all 3 files:', '```text', 'orderflow/', '├── package.json', '├── index.js', '└── test/', '    └── a.test.js', '```'].join('\n')
  assert.equal(spec(orderflow), true)
  for (const continuation of ['continue', 'fix the failing test in src/cart.js', 'Build it again', 'Run npm test and repair the failures']) {
    assert.equal(spec(continuation), false, continuation)
  }
})
