import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isNewBuilderProjectObjective } from '../lib/builder/project-continuity.ts'

const route = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')

test('explicit new-project Builder objectives pass the Builder admission gate', () => {
  assert.equal(isNewBuilderProjectObjective('Build a complete OrderFlow application with tests.'), true)
  const start = route.indexOf('const routingContext =')
  const end = route.indexOf('const workspace = createSupabaseBuilderWorkspace', start)
  const gate = route.slice(start, end)
  assert.ok(start >= 0 && end > start)
  assert.ok(gate.includes('!newProjectRequested && !isConciergeBuilderObjective(objective, routingContext)'))
  assert.ok(gate.includes("error: 'builder_objective_not_coding'"))
})

test('ordinary noncoding prompts remain outside explicit new-project handling', () => {
  assert.equal(isNewBuilderProjectObjective('What is the weather today?'), false)
  assert.equal(isNewBuilderProjectObjective('Who is the president?'), false)
})
