import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(new URL('../app/dashboard/cos-reasoning-comparison/page.tsx', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/admin/cos-reasoning-comparison/route.ts', import.meta.url), 'utf8')
const learnerRoute = readFileSync(new URL('../app/api/admin/cos-reasoning-learning-status/route.ts', import.meta.url), 'utf8')

test('reasoning comparison dashboard calls the owner-only comparison API', () => {
  assert.match(page, /\/api\/admin\/cos-reasoning-comparison/)
  assert.match(page, /method:\s*'POST'/)
  assert.match(page, /credentials:\s*'include'/)
  assert.match(page, /roles:\s*\[roleA, roleB\]/)
})

test('dashboard campaigns by Phase 4 learner bucket, not reporting track', () => {
  assert.match(page, /problemClassCaseCounts/)
  assert.match(page, /nextDiverseCaseForProblemClass/)
  assert.match(page, /Phase 4 learner bucket/)
  assert.match(page, /Learner buckets with enough diverse cases/)
})

test('campaign preserves the two-call server boundary while bounding one owner action', () => {
  assert.match(page, /MAX_CAMPAIGN_COMPARISONS = 4/)
  assert.match(page, /campaignTarget \* 2/)
  assert.match(page, /Run Evidence Campaign/)
  assert.match(page, /status !== 'insufficient_evidence'/)
  assert.match(page, /while \(completed < campaignTarget\)/)
})

test('dashboard shows the actual Phase 4 learner verdict and candidate evidence', () => {
  assert.match(page, /\/api\/admin\/cos-reasoning-learning-status/)
  assert.match(page, /Phase 4 learner verdict/)
  assert.match(page, /recommendedWorkerRole/)
  assert.match(page, /qualityScore/)
  assert.match(page, /averageLatencyMs/)
})

test('dashboard keeps verified-outcome and distinct-case evidence separate', () => {
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

test('learner status endpoint is owner-only and reads fresh derived evidence', () => {
  assert.match(learnerRoute, /requireOwner\(\)/)
  assert.match(learnerRoute, /loadReasoningOutcomeStatus\(problemClass, \{ fresh: true \}\)/)
  assert.match(learnerRoute, /recommendedWorkerRole/)
})
