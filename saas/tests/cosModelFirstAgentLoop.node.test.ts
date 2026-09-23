import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parseCosAgentDecision } from '../lib/ai/cos/cosAgentDecision.ts'

const browser = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
const primary = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
const decision = readFileSync(new URL('../lib/ai/cos/cosAgentDecision.ts', import.meta.url), 'utf8')

test('model decision parser accepts direct answers and filters capability plans to the host catalog', () => {
  assert.deepEqual(
    parseCosAgentDecision(
      '{"mode":"answer","answer":"Brasília.","confidence":0.99,"capabilities":[],"reason":"self_contained"}',
      'primary',
    ),
    { mode:'answer', answer:'Brasília.', confidence:0.99, capabilities:[], reason:'self_contained', reasonerLabel:'primary' },
  )
  assert.deepEqual(
    parseCosAgentDecision(
      '{"mode":"orchestrate","answer":"","confidence":0.91,"capabilities":["live_web","live_web","bogus"],"reason":"current transport"}',
      'primary',
    ),
    { mode:'orchestrate', answer:'', confidence:0.91, capabilities:['live_web'], reason:'current transport', reasonerLabel:'primary' },
  )
})

test('ordinary browser turns are model-first before optional capability orchestration', () => {
  assert.doesNotMatch(browser, /isSimpleKnowledgeQuestion\(prompt\)/)
  assert.doesNotMatch(browser, /answerSimpleKnowledgeQuestion\(prompt\)/)

  const decide = browser.indexOf('await decideCosAgentTurn({')
  const answer = browser.indexOf("agentDecision?.mode === 'answer'", decide)
  const orchestrate = browser.indexOf("agentDecision?.mode === 'orchestrate'", answer)
  const plannedSpecialist = browser.indexOf("agentDecision.capabilities.includes('software_specialist')", orchestrate)
  const cos = browser.indexOf('const executeCosRequest = () => cosPrimaryPost(routedRequest)', orchestrate)

  assert.ok(decide > 0)
  assert.ok(answer > decide)
  assert.ok(orchestrate > answer)
  assert.ok(plannedSpecialist > orchestrate)
  assert.ok(cos > plannedSpecialist)
  assert.match(browser, /const shouldConsultSoftwareSpecialist = hasSourceAttachment \|\| explicitOperationalRepair/)
})

test('model capability requests cannot grant authority', () => {
  assert.match(decision, /A capability request is NOT authorization/)
  assert.match(browser, /ownerAuthenticated: authenticatedOwner/)
  assert.match(browser, /allowRepositoryRepair: false/)
  assert.match(browser, /ownerSoftwareAuthority\.allowRepositoryRepair/)
  assert.match(browser, /if \(payload\.agent_decision\) delete payload\.agent_decision/)
})

test('public direct answers still pass disclosure and unsafe-output gates', () => {
  assert.match(browser, /hasUnsafePublicModelOutput\(agentDecision\.answer\)/)
  assert.match(browser, /publicDisclosureViolations\(agentDecision\.answer\)\.length > 0/)
  assert.match(browser, /public direct answer rejected by disclosure\/security gate/)
})

test('live_web and conversation_history plans steer COS without a second semantic classifier', () => {
  assert.match(primary, /modelPlannedFreshEvidence=agentCapabilities\.has\('live_web'\)/)
  assert.match(primary, /modelPlannedConversationRecall=agentCapabilities\.has\('conversation_history'\)/)
  assert.match(primary, /conversationRecallRequested=Boolean\(userId\)&&\(modelPlannedConversationRecall\|\|detectConversationRecallIntent\(input\)\)/)

  const semantic = primary.indexOf('const semanticTaskIntentNeeded=!requestedAction')
  const skip = primary.indexOf('&& !modelPlannedFreshEvidence', semantic)
  const baseline = primary.indexOf('const baselineRequiresFreshEvidence=(modelPlannedFreshEvidence||heuristicRequiresFreshEvidence||semanticRequiresFreshEvidence)', skip)
  assert.ok(semantic > 0)
  assert.ok(skip > semantic)
  assert.ok(baseline > skip)
})

test('current platform runtime facts stay host-verified rather than model-guessed', () => {
  assert.match(browser, /!isPlatformSelfKnowledgePrompt\(prompt\)/)
  assert.match(primary, /if\(access\?\.isOwner&&isPlatformSelfKnowledgePrompt\(input\)\)/)
})
