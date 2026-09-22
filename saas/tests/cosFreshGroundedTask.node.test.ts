// saas/tests/cosFreshGroundedTask.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const route = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
const localSynthesis = readFileSync(join(process.cwd(), 'lib/ai/cos/freshEvidenceLocalSynthesis.ts'), 'utf8')

test('travel planning bypasses the single-claim freshness contract and goes directly to grounded task completion', () => {
  const travelClassify = route.indexOf('const liveTravelTask=requiresLiveTravelPlanningEvidence(lookupInput)')
  const travelGrounded = route.indexOf('if(!requestedAction&&liveTravelTask)')
  const strictFresh = route.indexOf('if(!requestedAction&&!liveTravelTask)')
  assert.ok(travelClassify > 0)
  assert.ok(travelGrounded > travelClassify)
  assert.ok(strictFresh > travelGrounded)
  assert.match(route, /source:'cos-fresh-grounded-task'/)
})

test('grounded interactive task completion is bounded, JSON-enforced and disables Qwen thinking', () => {
  assert.match(route, /FRESH_GROUNDED_TASK_TIMEOUT_MS = 40_000/)
  assert.match(route, /jsonObject:true/)
  assert.match(route, /disableThinking:true/)
  assert.match(route, /timeoutMs:FRESH_GROUNDED_TASK_TIMEOUT_MS/)
  assert.match(route, /usageContext:\{feature:'cos_fresh_grounded_task',purpose:'fresh_grounded_task'\}/)
  assert.match(route, /\/no_think/)
})

test('travel tasks are not reclassified as bare fact lookups, while generic grounded tasks retain fail-closed fact handling', () => {
  assert.match(route, /This request is already classified as a travel-planning task/)
  assert.match(route, /do not return an empty answer merely because some details are unsupported/)
  assert.match(route, /If the request is only to confirm one specific current fact[\s\S]*return \{"answer":"","confidence":0\}/)
  assert.match(route, /must be clearly marked as unverified/)
  assert.match(route, /Never invent free services, discounts, businesses, venues, routes or prices/)
})

test('travel failure does not invoke the grounded task synthesizer a second time later in the route', () => {
  assert.match(route, /if\(freshHardFail&&freshRetrievedAt&&freshSources\.length&&!requestedAction&&!requiresLiveTravelPlanningEvidence\(lookupInput\)\)/)
  assert.equal((route.match(/const groundedTask=await runFreshGroundedTaskCompletion\(lookupInput,language,freshSources\)/g) || []).length, 2)
})


test('a grounded travel miss falls through to the shared live-evidence synthesizer before failure is recorded', () => {
  const travelBlock = route.indexOf('if(!requestedAction&&liveTravelTask)')
  const groundedDeclined = route.indexOf("event:'fresh_grounded_task_declined'", travelBlock)
  const sharedSynthesis = route.indexOf('if(!requestedAction){', groundedDeclined)
  const localCall = route.indexOf('synthesizeFreshEvidenceLocally({input:lookupInput,sources:freshSources,retrievedAt:freshRetrievedAt,language})', sharedSynthesis)
  const localFailureWrite = route.indexOf('freshLocalFailureCode=localSynthesis.kind', localCall)
  assert.ok(travelBlock > 0)
  assert.ok(groundedDeclined > travelBlock)
  assert.ok(sharedSynthesis > groundedDeclined)
  assert.ok(localCall > sharedSynthesis)
  assert.ok(localFailureWrite > localCall)
  const between = route.slice(groundedDeclined, localCall)
  assert.doesNotMatch(between, /freshLocalFailureCode='local_synthesis_failed'/)
  assert.match(between, /fallthrough:'shared_local_synthesizer'/)
})

test('once the fresh-evidence contract accepts a draft, review transport failures release that accepted draft', () => {
  assert.match(localSynthesis, /function acceptedOutcome\(accepted: AcceptedFreshEvidenceSynthesis\)/)
  assert.match(localSynthesis, /accepted_draft_released_after_review_transport_failure/)
  assert.match(localSynthesis, /reviewed\.kind === 'local_synthesis_failed'[\s\S]*return acceptedOutcome\(accepted\)/)
  assert.match(localSynthesis, /revised\.ok === false[\s\S]*return acceptedOutcome\(accepted\)/)
  assert.match(localSynthesis, /finalReview\.kind === 'local_synthesis_failed'[\s\S]*return acceptedOutcome\(repaired\)/)
})

test('structural or semantic review failures still fail closed', () => {
  assert.match(localSynthesis, /reviewed\.kind === 'unparseable'\) return \{ kind: 'citation_grounding_rejected' \}/)
  assert.match(localSynthesis, /finalReview\.kind === 'unparseable' \|\| !finalReview\.review\.faithful/)
  assert.match(localSynthesis, /review_failed_quality_boundary/)
})
