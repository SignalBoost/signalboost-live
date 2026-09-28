// saas/tests/cosChatPathCallLabels.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')

function functionSource(name: string): string {
  const start = route.indexOf(`async function ${name}`)
  assert.notEqual(start, -1, `${name} must exist in cos-primary`)
  const next = route.indexOf('\nasync function ', start + 1)
  return route.slice(start, next === -1 ? route.length : next)
}

test('completion rescue is attributed to interactive COS telemetry', () => {
  const source = functionSource('runCompletionFirstRescue')
  assert.match(source, /usageContext:\s*\{feature:'cos_interactive_answer',purpose:'completion_rescue'\}/)
})

test('fresh grounded answer inference carries a dedicated usage label', () => {
  assert.match(route, /usageContext:\s*\{feature:'cos_fresh_grounded_task',purpose:'fresh_grounded_task'\}/)
})

test('interactive travel attempts persist attributed provider usage', () => {
  assert.match(route, /persistUsage:true,\s*usageContext:\s*\{feature:'cos_interactive_travel_plan',purpose:attempt\.purpose\}/)
})
