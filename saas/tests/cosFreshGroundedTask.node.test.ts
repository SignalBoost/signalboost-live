// saas/tests/cosFreshGroundedTask.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const route = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
const inference = readFileSync(join(process.cwd(), 'lib/ai/local-inference.ts'), 'utf8')
const localSynthesis = readFileSync(join(process.cwd(), 'lib/ai/cos/freshEvidenceLocalSynthesis.ts'), 'utf8')

test('travel planning uses one bounded grounded lane and cannot fall through to stacked synthesis', () => {
  const travelClassify = route.indexOf('const liveTravelTask=requiresLiveTravelPlanningEvidence(lookupInput)')
  const travelBlock = route.indexOf('if(!requestedAction&&liveTravelTask)', travelClassify)
  const sharedFresh = route.indexOf('if(!requestedAction){', travelBlock)
  assert.ok(travelClassify > 0)
  assert.ok(travelBlock > travelClassify)
  assert.ok(sharedFresh > travelBlock)
  const travelSlice = route.slice(travelBlock, sharedFresh)
  assert.match(travelSlice, /runTravelPlanAssumptionRescue/)
  assert.match(travelSlice, /source:'cos-travel-plan-fast-grounded'/)
  assert.match(travelSlice, /source:'cos-travel-plan-fast-unavailable'/)
  assert.doesNotMatch(travelSlice, /runFreshGroundedTaskCompletion/)
  assert.doesNotMatch(travelSlice, /synthesizeFreshEvidenceLocally/)
  assert.doesNotMatch(travelSlice, /buildHonestRefusalReply/)
})

test('fast travel planning has one shared 16-second model budget with short attempts', () => {
  assert.match(route, /TRAVEL_PLAN_RESCUE_TIMEOUT_MS = 8_000/)
  assert.match(route, /TRAVEL_PLAN_TOTAL_MODEL_BUDGET_MS = 16_000/)
  assert.match(route, /TRAVEL_PLAN_RESCUE_MAX_TOKENS = 2_200/)
  assert.match(route, /feature:'cos_interactive_travel_plan'/)
  assert.match(route, /purpose:'travel_plan_grounded'/)
  assert.match(route, /timeoutMs:Math\.min\(TRAVEL_PLAN_RESCUE_TIMEOUT_MS,remaining\)/)
  assert.match(route, /Do not ask the traveller to narrow an already complete itinerary request/)
})

test('travel interactive profile bypasses RunPod readiness and uses the fast managed model profile', () => {
  assert.match(inference, /feature === 'cos_interactive_travel_plan'/)
  assert.match(inference, /COS_INTERACTIVE_TRAVEL_TIMEOUT_MS/)
  assert.match(inference, /COS_INTERACTIVE_TRAVEL_MODEL/)
  assert.match(inference, /deepseek-ai\/DeepSeek-V4-Flash/)
  const eligible = inference.slice(inference.indexOf('function eligibleForRunpodPrimary'), inference.indexOf('async function callConfiguredModel'))
  assert.match(eligible, /if \(interactiveUserResponse\(args\)\) return false/)
})

test('travel drafts must be substantive and cannot simply echo the request', () => {
  assert.match(route, /function groundedTaskReplyIsSubstantive/)
  assert.match(route, /nearEcho=/)
  assert.match(route, /!groundedTaskReplyIsSubstantive\(input,reply,false\)/)
  assert.match(route, /draft_too_short/)
})

test('generic fresh grounded tasks keep their strict JSON path for non-travel requests', () => {
  assert.match(route, /FRESH_GROUNDED_TASK_TIMEOUT_MS = 40_000/)
  assert.match(route, /FRESH_GROUNDED_TASK_MAX_TOKENS = 2_000/)
  assert.match(route, /jsonObject:true/)
  assert.match(route, /usageContext:\{feature:'cos_fresh_grounded_task',purpose:'fresh_grounded_task'\}/)
  assert.match(route, /if\(freshHardFail&&freshRetrievedAt&&freshSources\.length&&!requestedAction&&!requiresLiveTravelPlanningEvidence\(lookupInput\)\)/)
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
