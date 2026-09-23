import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { looksLikeArtifactContinuation } from '../lib/ai/cos/artifactContinuationIntent.ts'

const primary = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
const agent = readFileSync(join(process.cwd(), 'lib/ai/cos/cosAgentDecision.ts'), 'utf8')
const enterprise = readFileSync(join(process.cwd(), 'lib/ai/cos/cosFirstAnswerEnterprise.ts'), 'utf8')

test('semantic and creative memory are distinct native agent capabilities', () => {
  assert.match(agent, /'semantic_memory'/)
  assert.match(agent, /'creative_memory'/)
  assert.match(agent, /Creative Memory is never factual evidence/)
  assert.match(primary, /agentCapabilities\.has\('semantic_memory'\)/)
  assert.match(primary, /agentCapabilities\.has\('creative_memory'\)/)
})

test('explicit memory requests bypass answer cache and reach retrieval-backed COS', () => {
  assert.match(primary, /disableCache:strategyProfileRequest\|\|modelPlannedSemanticMemory\|\|modelPlannedCreativeMemory/)
})

test('creative memory is injected separately and never counted as factual evidence', () => {
  assert.match(enterprise, /CREATIVE MEMORY — VALIDATED APPROACH PATTERNS \(HOW TO SOLVE\/PRESENT, NEVER FACTUAL EVIDENCE\)/)
  assert.match(enterprise, /creativeMemoryFunnel/)
  assert.match(enterprise, /creativeMemoriesUsed/)
  assert.match(enterprise, /\[CM#\].*never factual evidence/i)
})

test('prior-answer transformations are recognized across the five platform languages', () => {
  for (const prompt of [
    'translate what you wrote into English',
    'przetłumacz to, co napisałeś na język angielski',
    'traduce lo que escribiste al inglés',
    'traduza o que você escreveu para inglês',
    'переведи то, что ты написал, на английский',
  ]) {
    assert.equal(looksLikeArtifactContinuation(prompt), true, prompt)
  }
})

test('artifact context is resolved before fast transform and authoring lanes', () => {
  const resolveAt = primary.indexOf('const freshConversationContext=resolveFreshConversationContext(body, input)')
  const fastAt = primary.indexOf('if(!artifactContinuation&&!fastEditAlreadyAttempted')
  const authorAt = primary.indexOf('const fastAuthoringEligible=!artifactContinuation')
  assert.ok(resolveAt > 0)
  assert.ok(fastAt > resolveAt)
  assert.ok(authorAt > fastAt)
})

test('travel fallback cannot mistake a transport-only source for a paid attraction', () => {
  const start = primary.indexOf('function buildTravelPlanEvidenceBackstop')
  const end = primary.indexOf('function previousAssistantText', start)
  const block = primary.slice(start, end)
  assert.match(block, /attractionSpecific/)
  assert.match(block, /transportOnly/)
  assert.match(block, /return attractionSpecific&&!transportOnly/)
  assert.doesNotMatch(block, /\|ticket\|/)
  assert.match(block, /rejs po kanałach lub Rijksmuseum/)
})

test('travel planner receives Creative Memory guidance before live-evidence synthesis', () => {
  const start = primary.indexOf('async function runTravelPlanAssumptionRescue')
  const end = primary.indexOf('function buildTravelPlanEvidenceBackstop', start)
  const block = primary.slice(start, end)
  assert.match(block, /retrieveCreativeMemory/)
  assert.match(block, /CREATIVE MEMORY — HOW TO SOLVE\/PRESENT, NEVER FACTUAL EVIDENCE/)
})


test('deterministic travel backstop still applies Creative Memory and records it', () => {
  const start = primary.indexOf('async function buildTravelPlanEvidenceBackstop')
  const end = primary.indexOf('function previousAssistantText', start)
  const block = primary.slice(start, end)
  assert.match(block, /retrieveCreativeMemory\(input,\{privileged,limit:3\}\)/)
  assert.match(block, /proactiveCompletion/)
  assert.match(block, /Jeśli zostanie Ci dodatkowe 30–60 minut/)
  assert.match(block, /Najtańszy wariant/)
  assert.match(primary, /const backstop=await buildTravelPlanEvidenceBackstop\(lookupInput,language,freshSources,isPrivileged\)/)
  assert.match(primary, /creative_memory:\{used:backstop\.creativeMemory\.selected>0/)
  assert.match(primary, /semantics:'non_factual_guidance'/)
})


test('deterministic travel backstop does not expose internal timeout status', () => {
  const start = primary.indexOf('async function buildTravelPlanEvidenceBackstop')
  const end = primary.indexOf('function previousAssistantText', start)
  const block = primary.slice(start, end)
  assert.doesNotMatch(block, /Plan awaryjny — COS pobrał/)
  assert.doesNotMatch(block, /Fallback plan — COS retrieved current sources/)
})
