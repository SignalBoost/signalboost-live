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
