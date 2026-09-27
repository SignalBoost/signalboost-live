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
  const directRelease = browser.indexOf("if (agentDecision?.mode === 'answer') {", freshnessGuard)
  assert.ok(freshnessGuard > decide)
  assert.ok(directRelease > freshnessGuard)
  const guard = browser.slice(freshnessGuard, directRelease)
  assert.match(guard, /capabilities: \['live_web'\]/)
  assert.match(guard, /reason: 'host_freshness_guard'/)
  assert.match(guard, /requiresLiveTravelPlanningEvidence\(prompt\)/)
})

test('a native capability plan suppresses redundant semantic classification downstream', () => {
  assert.match(primary, /const modelPlannedFreshEvidence=agentCapabilities\.has\('live_web'\)/)
  assert.match(primary, /const semanticTaskIntentNeeded=!requestedAction\s*\n\s*&& !modelPlannedFreshEvidence/)
  assert.match(primary, /const baselineRequiresFreshEvidence=\(modelPlannedFreshEvidence\|\|heuristicRequiresFreshEvidence\|\|semanticRequiresFreshEvidence\)/)
})

test('public Concierge cannot request owner-private capabilities', () => {
  const catalog = decision.slice(decision.indexOf('function toolCatalog'), decision.indexOf('function turnReasonerLabel'))
  assert.match(catalog, /input\.surface === 'concierge'\s*\n\s*\? \['live_web'\]/)
  assert.match(catalog, /input\.ownerAuthenticated\s*\n\s*\? COS_AGENT_CAPABILITIES/)
})

test('questions about this service skip the first-turn direct model answer', async () => {
  // Production 2026-09-26: "What is iTMounts?" was answered directly by the first-turn model as
  // "a digital mount management system" because that model has no identity or glossary.
  const gate = browser.indexOf('const asksAboutThisService = isSignalBoostSpecificPublicRequest(prompt)')
  const ownerOnly = browser.indexOf("|| (browserSurface !== 'concierge' && authenticatedOwner && mentionsPlatformConcept(prompt))", gate)
  const guarded = browser.indexOf('!isPlatformSelfKnowledgePrompt(prompt) && !asksAboutThisService', ownerOnly)
  const decide = browser.indexOf('agentDecision = await decideCosAgentTurn({', guarded)
  assert.ok(gate > 0 && ownerOnly > gate && guarded > ownerOnly && decide > guarded)

  const { isSignalBoostSpecificPublicRequest } = await import('../lib/ai/cos/publicScenarioScope.ts')
  assert.equal(isSignalBoostSpecificPublicRequest('What is iTMounts?'), true)
  assert.equal(isSignalBoostSpecificPublicRequest('What is a mountaineering harness?'), false)
})
