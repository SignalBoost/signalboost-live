import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isContentGenerationRequest } from '../lib/ai/cos/contentGenerationIntent.ts'
import { requiresFreshExternalEvidence, requiresLiveTravelPlanningEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'
import { stableKnowledgeQuestionNeedsNoPlanner } from '../lib/ai/cos/cosAgentDecision.ts'

test('the live Dwight edit shape is transformation work, never fresh web lookup', () => {
  const prompt = 'edit Dwight, thank you for let me know and for your ocncern - if you are thinking about cancelling it because of me, do not worry. At the end of the day, this is at the moment a one-person post. If I do not do it, you will have to do it. We do what we have to do and whatever is needed to support the mission.'
  assert.equal(isContentGenerationRequest(prompt), true)
  assert.equal(requiresFreshExternalEvidence(prompt), false)
})

test('common general-assistant transformation tasks stay off freshness routing', () => {
  for (const prompt of [
    'rewrite this paragraph so it is more professional: The current version is too long and I need it today.',
    'proofread this email: I am writing about the current schedule and need the grammar fixed.',
    'summarize this text: The current deployment is discussed in this pasted document, but I only want a summary.',
    'translate this paragraph into Polish: This is the current draft of my letter.',
    'edite este texto: Esta é a versão atual da minha mensagem e quero apenas melhorar a redação.',
    'popraw ten tekst: To jest aktualna wersja mojego e-maila i chcę tylko poprawić styl.',
  ]) {
    assert.equal(isContentGenerationRequest(prompt), true, prompt)
    assert.equal(requiresFreshExternalEvidence(prompt), false, prompt)
  }
})

test('the stable public Concierge endpoint enters public scope around the same COS brain with no RunPod lifecycle stage', () => {
  const proxy = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8')
  const browser = readFileSync(join(process.cwd(), 'app/api/cos-browser/route.ts'), 'utf8')

  assert.match(proxy, /pathname === '\/api\/concierge'/)
  assert.match(proxy, /cosBrowserUrl\.pathname = '\/api\/cos-browser'/)
  assert.match(browser, /import \{ withPublicDeliveryScope \} from '@\/lib\/auth\/publicDeliveryScope'/)
  assert.match(browser, /const executeCosRequest = \(\) => cosPrimaryPost\(routedRequest\)/)
  assert.match(browser, /withPublicAuditIdentity\(auditUserId, \(\) => withPublicDeliveryScope\(\(\) => executeCosRequest\(\)\)\)/)
  assert.doesNotMatch(browser, /publicConciergePost|executeOwnerRequest|executePublicRequest/)
  assert.doesNotMatch(browser, /RunPod|Runpod|runpod|withRunpodWakePermission|evaluateRunpodWakePermission/)
})


test('public Concierge shares the governed University learned-evidence path with COS', () => {
  const browser = readFileSync(join(process.cwd(), 'app/api/cos-browser/route.ts'), 'utf8')
  const enterprise = readFileSync(join(process.cwd(), 'lib/ai/cos/cosFirstAnswerEnterprise.ts'), 'utf8')
  assert.match(browser, /cosPrimaryPost\(routedRequest\)/)
  assert.match(enterprise, /cos_university_distillation_assets/)
  assert.match(enterprise, /contains_private_production_data', false/)
  assert.match(enterprise, /source_kind: 'university_distillation_asset'/)
  assert.match(enterprise, /CONTINUOUS LEARNING CORPUS:/)
})

test('the public Concierge browser ingress routes explicit artifacts before normal COS', () => {
  const browser = readFileSync(join(process.cwd(), 'app/api/cos-browser/route.ts'), 'utf8')
  assert.match(browser, /isConciergeArtifactObjective\(prompt\)/)
  assert.match(browser, /artifactPost\(artifactRequest\)/)
  assert.match(browser, /new URL\('\/api\/artifacts', req\.url\)/)
  const artifact = browser.indexOf('isConciergeArtifactObjective(prompt)')
  const primary = browser.indexOf('cosPrimaryPost(routedRequest)')
  assert.ok(artifact >= 0)
  assert.ok(primary > artifact)
})


test('mutable travel planning remains model-first with host freshness as a post-model backstop', () => {
  const browser = readFileSync(join(process.cwd(), 'app/api/cos-browser/route.ts'), 'utf8')
  const decision = browser.indexOf('agentDecision = await decideCosAgentTurn({')
  const freshness = browser.indexOf("agentDecision?.mode === 'answer' && (requiresFreshExternalEvidence(prompt) || requiresLiveTravelPlanningEvidence(prompt))", decision)
  const orchestration = browser.indexOf("if (agentDecision?.mode === 'orchestrate')", freshness)
  assert.ok(decision >= 0)
  assert.ok(freshness > decision)
  assert.ok(orchestration > freshness)
  assert.doesNotMatch(browser, /const deterministicTravelPlan = requiresLiveTravelPlanningEvidence\(prompt\)/)
  assert.match(browser, /capabilities: \['live_web'\]/)
  assert.match(browser, /reason: 'host_freshness_guard'/)
})


test('evergreen concept questions skip the expensive capability planner on both shared surfaces', () => {
  const bullwhip = 'What is the bullwhip effect in supply-chain management, what causes it, and what practical steps can a retailer take to reduce it?'
  assert.equal(stableKnowledgeQuestionNeedsNoPlanner(bullwhip), true)
  assert.equal(stableKnowledgeQuestionNeedsNoPlanner('What is the weather in Warsaw today?'), false)
  assert.equal(stableKnowledgeQuestionNeedsNoPlanner('How do I fix PR 3486 in my repository?'), false)
  const browser = readFileSync(join(process.cwd(), 'app/api/cos-browser/route.ts'), 'utf8')
  assert.match(browser, /!stableKnowledgeQuestionNeedsNoPlanner\(prompt, priorAnswer\)/)
})
