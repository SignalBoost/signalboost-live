// saas/tests/cosNativeAgentFreshnessGuard.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const browser = readFileSync(join(process.cwd(), 'app/api/cos-browser/route.ts'), 'utf8')
const decision = readFileSync(join(process.cwd(), 'lib/ai/cos/cosAgentDecision.ts'), 'utf8')
const primary = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
const inference = readFileSync(join(process.cwd(), 'lib/ai/local-inference.ts'), 'utf8')

test('COS first semantic decision uses native OpenAI-compatible tool calling', () => {
  assert.match(decision, /callLocalModelTurn\(/)
  assert.match(decision, /tools,\s*\n\s*toolChoice: 'auto'/)
  assert.match(decision, /nativeTurn\?\.toolCalls\.length/)
  assert.match(inference, /tools: args\.tools, tool_choice: args\.toolChoice \?\? 'auto'/)
  assert.match(inference, /message\?\.tool_calls/)
})

test('model-first decision occurs before capability orchestration and primary COS execution', () => {
  const decide = browser.indexOf('agentDecision = await decideCosAgentTurn({')
  const orchestration = browser.indexOf("if (agentDecision?.mode === 'orchestrate')", decide)
  const primaryCall = browser.indexOf('cosPrimaryPost(routedRequest)', orchestration)
  assert.ok(decide > 0)
  assert.ok(orchestration > decide)
  assert.ok(primaryCall > orchestration)
})

test('freshness is a post-model release guard, not a pre-model semantic router', () => {
  const decide = browser.indexOf('agentDecision = await decideCosAgentTurn({')
  const freshnessGuard = browser.indexOf("agentDecision?.mode === 'answer' && (requiresFreshExternalEvidence(prompt)", decide)
  // The word rules only suggest the lookup; the turn intent judge must not read the request as supplied-facts reasoning.
  assert.match(browser.slice(freshnessGuard, freshnessGuard + 400), /&& !semanticIntentSuppressesFreshness\(await turnIntent\(\)\)\) \{/)
  const directRelease = browser.indexOf("if (agentDecision?.mode === 'answer') {", freshnessGuard)
  assert.ok(freshnessGuard > decide)
  assert.ok(directRelease > freshnessGuard)
  const guard = browser.slice(freshnessGuard, directRelease)
  assert.match(guard, /capabilities: \['live_web'\]/)
  assert.match(guard, /reason: 'host_freshness_guard'/)
  assert.match(guard, /requiresLiveTravelPlanningEvidence\(prompt\)/)
})

test('a planned live lookup is still adjudicated by the turn intent judge downstream', () => {
  assert.match(primary, /const modelPlannedFreshEvidence=agentCapabilities\.has\('live_web'\)/)
  assert.match(primary, /const semanticTaskIntentNeeded=!requestedAction\s*\n\s*&& \(modelPlannedFreshEvidence \|\| heuristicRequiresFreshEvidence/)
  assert.match(primary, /const baselineRequiresFreshEvidence=!suppliedIncidentAnalysis&&\(modelPlannedFreshEvidence\|\|heuristicRequiresFreshEvidence\|\|semanticRequiresFreshEvidence\)/)
})

test('public Concierge cannot request owner-private capabilities', () => {
  const catalog = decision.slice(decision.indexOf('function toolCatalog'), decision.indexOf('function turnReasonerLabel'))
  // Public Concierge keeps the public-safe list; only the signed-in owner also gets the verification campaign there.
  assert.match(catalog, /input\.surface === 'concierge'\s*\n\s*\? input\.ownerAuthenticated \? \['live_web', 'compute', 'software_specialist', 'verification_campaign'\] : \['live_web', 'compute', 'software_specialist'\]/)
  const conciergeLine = catalog.slice(catalog.indexOf("input.surface === 'concierge'"), catalog.indexOf('\n', catalog.indexOf("? input.ownerAuthenticated ?")))
  assert.doesNotMatch(conciergeLine, /repository_read|platform_runtime|internal_context|external_action/)
  assert.match(catalog, /input\.ownerAuthenticated\s*\n\s*\? COS_AGENT_CAPABILITIES/)
})

test('questions about this service are answered by COS, never by a planner lookup', async () => {
  // Production 2026-09-26: "What is iTMounts?" was answered directly by the first-turn model as
  // "a digital mount management system" because that model has no identity or glossary.
  const gate = browser.indexOf('const asksAboutThisService = isSignalBoostSpecificPublicRequest(prompt)')
  const ownerOnly = browser.indexOf("|| (browserSurface !== 'concierge' && authenticatedOwner && mentionsPlatformConcept(prompt))", gate)
  // The planner is consulted so real software work on this service reaches the Software Specialist (2026-10-26); any
  // other capability it asks for is dropped and COS answers from its owner-approved identity.
  const decide = browser.indexOf('agentDecision = await decideCosAgentTurn({', ownerOnly)
  const guarded = browser.indexOf("(isPlatformSelfKnowledgePrompt(prompt) || asksAboutThisService) && agentDecision?.mode === 'orchestrate'", decide)
  const dropped = browser.indexOf('agentDecision = null', guarded)
  assert.ok(gate > 0 && ownerOnly > gate && decide > ownerOnly && guarded > decide && dropped > guarded)
  assert.match(browser.slice(guarded, dropped), /!agentDecision\.capabilities\.includes\('software_specialist'\) && !agentDecision\.capabilities\.includes\('repository_read'\)/)

  const { isSignalBoostSpecificPublicRequest } = await import('../lib/ai/cos/publicScenarioScope.ts')
  assert.equal(isSignalBoostSpecificPublicRequest('What is iTMounts?'), true)
  assert.equal(isSignalBoostSpecificPublicRequest('What is a mountaineering harness?'), false)
})
