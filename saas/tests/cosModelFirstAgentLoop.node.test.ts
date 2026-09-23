import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parseCosAgentDecision } from '../lib/ai/cos/cosAgentDecision.ts'

const browser = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
const primary = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
const decision = readFileSync(new URL('../lib/ai/cos/cosAgentDecision.ts', import.meta.url), 'utf8')

test('agent decision parser accepts direct answers and bounded capability plans', () => {
  assert.deepEqual(
    parseCosAgentDecision('{"mode":"answer","answer":"Brasília.","confidence":0.99,"capabilities":[],"reason":"self_contained"}', 'qwen'),
    { mode:'answer', answer:'Brasília.', confidence:0.99, capabilities:[], reason:'self_contained', reasonerLabel:'qwen' },
  )
  assert.deepEqual(
    parseCosAgentDecision('{"mode":"orchestrate","answer":"","confidence":0.93,"capabilities":["live_web","live_web","bogus"],"reason":"current fares"}', 'qwen'),
    { mode:'orchestrate', answer:'', confidence:0.93, capabilities:['live_web'], reason:'current fares', reasonerLabel:'qwen' },
  )
})

test('ordinary turns let the primary model answer or request capabilities before optional specialists', () => {
  const decisionAt = browser.indexOf('await decideCosAgentTurn({')
  const directAt = browser.indexOf("agentDecision?.mode === 'answer'", decisionAt)
  const orchestrateAt = browser.indexOf("agentDecision?.mode === 'orchestrate'", directAt)
  const specialistFromPlanAt = browser.indexOf("agentDecision.capabilities.includes('software_specialist')", orchestrateAt)
  const cosAt = browser.indexOf('const executeCosRequest = () => cosPrimaryPost(routedRequest)', orchestrateAt)
  assert.ok(decisionAt > 0)
  assert.ok(directAt > decisionAt)
  assert.ok(orchestrateAt > directAt)
  assert.ok(specialistFromPlanAt > orchestrateAt)
  assert.ok(cosAt > specialistFromPlanAt)
  assert.match(browser, /const shouldConsultSoftwareSpecialist = hasSourceAttachment \|\| explicitOperationalRepair/)
})

test('capability plans never grant authority and public delivery hides internal routing metadata', () => {
  assert.match(decision, /A capability request is NOT authorization/)
  assert.match(browser, /ownerAuthenticated: authenticatedOwner/)
  assert.match(browser, /allowRepositoryRepair: false/)
  assert.match(browser, /if \(payload\.agent_decision\) delete payload\.agent_decision/)
})

test('live_web plan controls fresh-evidence routing without paying for a second semantic classifier', () => {
  const capability = primary.indexOf("const modelPlannedFreshEvidence=agentCapabilities.has('live_web')")
  const classifier = primary.indexOf('const semanticTaskIntentNeeded=!requestedAction', capability)
  const skip = primary.indexOf('&& !modelPlannedFreshEvidence', classifier)
  const baseline = primary.indexOf('const baselineRequiresFreshEvidence=(modelPlannedFreshEvidence||heuristicRequiresFreshEvidence||semanticRequiresFreshEvidence)', skip)
  assert.ok(capability > 0)
  assert.ok(classifier > capability)
  assert.ok(skip > classifier)
  assert.ok(baseline > skip)
})

test('host runtime self-knowledge bypasses model-memory guessing', () => {
  assert.match(browser, /!isPlatformSelfKnowledgePrompt\(prompt\)/)
  assert.match(primary, /if\(access\?\.isOwner&&isPlatformSelfKnowledgePrompt\(input\)\)/)
})
