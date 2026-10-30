// saas/tests/cosComposeWithLiveEvidence.node.test.ts
// Production 2026-10-30 ~11:04 (America/Asuncion): "draft a letter to my CDO ... since I will be 65 next year there is
// a possibility to extend my retirement for another 5 years, what shall I do if it is true" got "I found current
// sources, but the drafted answer did not meet the verification requirement". The live lookup ran, but the fact-only
// lane keeps cited sentences alone, so the letter and the advice were deleted. A deliverable that needs outside facts
// is now written whole by COS from the retrieved sources.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { liveEvidenceCompositionBlock, withCitedLiveSources } from '../lib/ai/cos/composeWithLiveEvidence.ts'
import { semanticIntentComposesWithEvidence, semanticIntentRequiresFreshness, type CosSemanticTaskIntent } from '../lib/ai/cos/cosSemanticTaskIntent.ts'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const source = (id: string, title: string, url: string, snippet: string) => ({ id, title, url, snippet }) as any

test('a letter or advice that needs outside facts is composed from evidence; a fact question is not', () => {
  const letter: CosSemanticTaskIntent = { mode: 'content_generation', confidence: 0.9, suppliedContextPrimary: false, externalFactsRequired: true }
  const advice: CosSemanticTaskIntent = { ...letter, mode: 'general_reasoning' }
  const fact: CosSemanticTaskIntent = { ...letter, mode: 'external_fact_verification' }
  assert.equal(semanticIntentComposesWithEvidence(letter), true)
  assert.equal(semanticIntentComposesWithEvidence(advice), true)
  assert.equal(semanticIntentComposesWithEvidence(fact), false)
  assert.equal(semanticIntentComposesWithEvidence({ ...letter, externalFactsRequired: false }), false)
  assert.equal(semanticIntentComposesWithEvidence({ ...letter, confidence: 0.5 }), false)
  assert.equal(semanticIntentComposesWithEvidence(null), false)
  // The live lookup still runs for the letter: composing needs the facts first.
  assert.equal(semanticIntentRequiresFreshness(letter), true)
})

test('the writer gets the sources, the rule for facts, and the rule for unconfirmed facts', () => {
  const block = liveEvidenceCompositionBlock([source('LIVE1', '22 U.S.C. 4052', 'https://www.law.cornell.edu/uscode/text/22/4052', 'The Secretary may retain a participant ... for up to 5 years beyond age 65 in the public interest.')])
  assert.match(block, /\[LIVE1\] 22 U\.S\.C\. 4052 — https:\/\/www\.law\.cornell\.edu/)
  assert.match(block, /up to 5 years beyond age 65/)
  assert.match(block, /Write every deliverable the user asked for, in full/)
  assert.match(block, /still needs confirmation and from whom; never state it as true/)
  assert.match(block, /Keep abbreviations exactly as the user wrote them/)
  assert.match(liveEvidenceCompositionBlock([]), /No live source could be retrieved for this request\./)
})

test('the host lists the cited sources under the reply, in citation order, and only those', () => {
  const sources = [source('LIVE1', 'One', 'https://a.example/1', ''), source('LIVE2', 'Two', 'https://b.example/2', ''), source('LIVE3', 'Three', 'https://c.example/3', '')]
  const reply = 'You may be retained up to five years past 65 [LIVE2], at the Secretary\'s discretion [LIVE2] [LIVE1].'
  assert.equal(withCitedLiveSources(reply, sources), `${reply}\n\n[LIVE2] Two — https://b.example/2\n[LIVE1] One — https://a.example/1`)
  assert.equal(withCitedLiveSources('No citation here.', sources), 'No citation here.')
  assert.equal(withCitedLiveSources('Unknown [LIVE9].', sources), 'Unknown [LIVE9].')
})

test('COS writes the deliverable from the retrieved sources instead of the fact-only lane, and runs no second lookup', () => {
  const primary = read('app/api/cos-primary/route.ts')
  const compose = primary.indexOf('if(semanticIntentComposesWithEvidence(semanticTaskIntent)){')
  const authority = primary.indexOf('if(!authoritySatisfied&&!composeEvidence){')
  const factLane = primary.indexOf('if(!freshMissUseLocal){', compose)
  assert.ok(compose > 0 && authority > compose && factLane > authority, 'composing is decided before the authority refusal and the fact-only lane')
  assert.match(primary.slice(compose, authority), /composeEvidence=freshSources\s*\n\s*freshMissUseLocal=true/)
  assert.match(primary, /if\(composeEvidence\) reasoningPrompt=`\$\{liveEvidenceCompositionBlock\(composeEvidence\)\}/)
  assert.match(primary, /tryCOSFirstAnswer\(\{prompt:reasoningPrompt,liveEvidenceSupplied:Boolean\(composeEvidence\),/)
  assert.match(primary, /runCompletionFirstRescue\(composeEvidence\?reasoningPrompt:input,language,cosAudience\(isPrivileged\),input\)/)
  // The rescue answer is checked against what the user asked, not against the evidence block.
  const rescue = primary.slice(primary.indexOf('async function runCompletionFirstRescue'), primary.indexOf('function completionFirstResponse('))
  assert.equal((rescue.match(/verifyAnswerOutcome\(\{request:userRequest,/g) || []).length, 2)
  const core = read('lib/ai/cos/cosFirstAnswerCore.ts')
  assert.match(core, /if \(baselineRequiresFreshEvidence && !suppressFreshnessForInterpretation && input\.liveEvidenceSupplied !== true\) \{/)
  assert.match(core, /input\.liveEvidenceSupplied !== true && classifyKnowledgeAccess\(input\.prompt\)\.mode === 'search_if_thin'/)
})
