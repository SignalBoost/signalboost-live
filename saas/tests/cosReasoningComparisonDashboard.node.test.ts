import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(new URL('../app/dashboard/cos-reasoning-comparison/page.tsx', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/admin/cos-reasoning-comparison/route.ts', import.meta.url), 'utf8')

test('reasoning comparison dashboard calls the owner-only comparison API', () => {
  assert.match(page, /\/api\/admin\/cos-reasoning-comparison/)
  assert.match(page, /method:\s*'POST'/)
  assert.match(page, /credentials:\s*'include'/)
  assert.match(page, /roles:\s*\[roleA, roleB\]/)
})

test('dashboard rotates through private diverse cases instead of repeating one case', () => {
  assert.match(page, /privateSuiteOrigin/)
  assert.match(page, /nextDiverseCase/)
  assert.match(page, /incident-reasoning/)
  assert.match(page, /two billable model evaluations/i)
  assert.match(page, /Run Next Diverse Comparison/)
})

test('dashboard shows the Phase 4 evidence floor separately from distinct-case diversity', () => {
  assert.match(page, /minimumVerifiedOutcomesPerCandidate/)
  assert.match(page, /verifiedOutcomeCountForCandidate/)
  assert.match(page, /distinctVerifiedCaseCount/)
  assert.match(page, /verified outcomes/)
  assert.match(page, /distinct cases/)
})

test('dashboard prevents comparing a worker with itself', () => {
  assert.match(page, /roleA === roleB/)
  assert.match(page, /Choose two different workers/)
})

test('owner API exposes learner metadata but never returns held-out prompt text', () => {
  assert.match(route, /problemClass:\s*classifyProblemClass/)
  assert.match(route, /privateSuiteOrigin:\s*PRIVATE_DIVERSE_SUITE_ORIGIN/)
  assert.match(route, /minimumVerifiedOutcomesPerCandidate/)
  const responseMapping = route.slice(route.indexOf('return NextResponse.json({'), route.indexOf('export async function POST'))
  assert.doesNotMatch(responseMapping, /prompt:\s*row\.prompt/)
})
