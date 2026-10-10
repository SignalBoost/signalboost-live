// saas/tests/freshEvidenceLocalSynthesis.node.test.ts
//
// Single-pass grounded reasoning over live evidence (2026-10-10). Replaces the scope-plan /
// contract / faithfulness-review state machine. Pins: the host tells the model its own citation
// requirement; deterministic acceptance checks only what it can verify; one concrete repair.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  acceptFreshEvidenceGroundedAnswer,
  freshEvidenceGroundedAnswerPrompt,
  freshEvidenceGroundedRepairPrompt,
  FRESH_GROUNDED_ANSWER_MAX_TOKENS,
  FRESH_GROUNDED_ANSWER_TIMEOUT_MS,
  FRESH_GROUNDED_EVIDENCE_CHARS_PER_SOURCE,
  FRESH_GROUNDED_EVIDENCE_CHARS_TOTAL,
  compactFreshEvidenceForReasoning,
  excerptEvidenceForQuestion,
} from '../lib/ai/cos/freshEvidenceGroundedAnswer.ts'
import { describeFreshCitationRequirement, freshCitationRequirement } from '../lib/ai/cos/cosFreshAuthority.ts'
import type { FreshEvidenceSource } from '../lib/ai/cos/cosFreshGrounding.ts'

const sources: FreshEvidenceSource[] = [
  { id: 'LIVE1', title: 'Candidate A edges Candidate B in the first round', url: 'https://en.mercopress.com/2026/10/05/first-round', snippet: 'Candidate A won around 47% of valid votes; runoff on October 25.', sourceDate: '2026-10-05' },
  { id: 'LIVE2', title: 'Candidates head to runoff', url: 'https://www.chinadailyhk.com/article/640532', snippet: 'No candidate secured a majority; runoff on Oct 25.', sourceDate: '2026-10-05' },
]
const officeQuestion = 'who will be the next brazilian president?'
const plainQuestion = 'what is the population of Lisbon?'
const retrievedAt = '2026-10-10T08:00:00.000Z'

test('the prompt states the host citation requirement the validator will enforce', () => {
  const office = freshCitationRequirement(officeQuestion, sources)
  assert.equal(office.minIndependentHosts, 2)
  assert.equal(office.officialPublisherSufficient, true)
  const prompt = freshEvidenceGroundedAnswerPrompt({ input: officeQuestion, sources, retrievedAt, language: 'en', lengthRule: 'CHAT ANSWER LENGTH: test rule' })
  assert.match(prompt.systemPrompt, /CITATION REQUIREMENT \(enforced by the server before release\)/)
  assert.match(prompt.systemPrompt, /at least TWO different hosts/)
  assert.match(prompt.systemPrompt, /LIVE1=en\.mercopress\.com/)
  assert.match(prompt.systemPrompt, /LIVE2=chinadailyhk\.com/)
  assert.match(prompt.systemPrompt, /never answer "insufficient"/)
  assert.match(prompt.systemPrompt, /Never turn a lead, a poll, or incumbency into a predicted or declared winner/)
  assert.match(prompt.systemPrompt, /CHAT ANSWER LENGTH/)
  assert.match(prompt.prompt, /CURRENT-FACT LIVE EVIDENCE — SERVER RETRIEVED/)
  assert.match(prompt.prompt, new RegExp(`QUESTION: ${officeQuestion.replace('?', '\\?')}`))

  const plain = freshCitationRequirement(plainQuestion, sources)
  assert.equal(plain.minIndependentHosts, 1)
  assert.match(describeFreshCitationRequirement(plain, sources), /at least one is required/)
})

test('a prose answer citing two independent hosts is released with a server-built source list', () => {
  const text = 'It is undecided: the first round on 4 October sent Candidate A (about 47%) and Candidate B to a runoff on 25 October, as reported by [LIVE1] and [LIVE2]; no official result is declared yet.'
  const accepted = acceptFreshEvidenceGroundedAnswer({ text, input: officeQuestion, sources })
  assert.equal(accepted.ok, true)
  assert.equal(accepted.reason, null)
  assert.deepEqual(accepted.citedSourceIds, ['LIVE1', 'LIVE2'])
  assert.match(accepted.reply, /\n\nSources: \[LIVE1\] \(https:\/\/en\.mercopress\.com\/2026\/10\/05\/first-round\) and \[LIVE2\] \(https:\/\/www\.chinadailyhk\.com\/article\/640532\)$/)
})

test('an office answer citing only one of two reports is sent to repair with the concrete missing requirement, not silently rejected', () => {
  const text = 'The runoff is on 25 October [LIVE1].'
  const accepted = acceptFreshEvidenceGroundedAnswer({ text, input: officeQuestion, sources })
  assert.equal(accepted.ok, false)
  assert.equal(accepted.reason, 'citation_requirement_unmet')
  const repair = freshEvidenceGroundedRepairPrompt({ input: officeQuestion, sources, retrievedAt, language: 'en', draft: accepted.answer, reason: accepted.reason! })
  assert.match(repair.prompt, /REPAIR: Your draft was not released because it did not meet the citation requirement/)
  assert.match(repair.prompt, /at least TWO different hosts/)
  assert.match(repair.prompt, /PREVIOUS DRAFT \(not evidence\):\nThe runoff is on 25 October \[LIVE1\]\./)
})

test('ordinary current facts release on one cited source; invented ids are stripped, not fatal', () => {
  const text = 'Lisbon has about 545,000 residents [LIVE1][LIVE9].'
  const accepted = acceptFreshEvidenceGroundedAnswer({ text, input: plainQuestion, sources })
  assert.equal(accepted.ok, true)
  assert.deepEqual(accepted.citedSourceIds, ['LIVE1'])
  assert.doesNotMatch(accepted.answer, /LIVE9/)
})

test('an answer that cites nothing, or is empty, is not released as a live answer', () => {
  assert.equal(acceptFreshEvidenceGroundedAnswer({ text: 'The runoff is on 25 October.', input: plainQuestion, sources }).reason, 'no_evidence_cited')
  assert.equal(acceptFreshEvidenceGroundedAnswer({ text: '   ', input: plainQuestion, sources }).reason, 'empty_answer')
})

test('the live-fact path is one interactive-lane call with at most one repair, and the chain is gone', () => {
  const source = readFileSync(new URL('../lib/ai/cos/freshEvidenceLocalSynthesis.ts', import.meta.url), 'utf8')
  assert.match(source, /usageContext: \{ feature: 'cos_interactive_answer', purpose: 'fresh_grounded_answer' \}/)
  assert.match(source, /disableThinking: true/)
  assert.equal(FRESH_GROUNDED_ANSWER_TIMEOUT_MS, 20_000)
  assert.equal(FRESH_GROUNDED_ANSWER_MAX_TOKENS, 350)
  assert.match(source, /resolveCosReasoner/)
  assert.match(source, /lengthRule: CHAT_ANSWER_LENGTH_RULE/)
  assert.doesNotMatch(source, /jsonObject|EVIDENCE_INSUFFICIENT|scope_plan|faithfulness|semanticPlan|predicateAudit|callLocalModel/)
  assert.equal((source.match(/groundedAnswerCall\(/g) || []).length, 4, 'definition + first call + empty-transport retry + one citation repair')
  const pure = readFileSync(new URL('../lib/ai/cos/freshEvidenceGroundedAnswer.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(pure, /from '@\//, 'pure module stays relative-import only so tests can load it')
  const external = readFileSync(new URL('../lib/ai/cos/freshEvidenceExternalSynthesis.ts', import.meta.url), 'utf8')
  assert.match(external, /acceptFreshEvidenceGroundedAnswer/)
  assert.doesNotMatch(external, /SynthesisContract|ContractRecovery|PredicateAudit/)
})

// The citation requirement is now stated to the model up front and on repair (see the first test)
// rather than living in a separate contract-recovery module.
test('COS researches additional live evidence before rejecting an externally grounded answer', () => {
  const route = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
  assert.match(route, /localSynthesis.kind === 'citation_grounding_rejected' && Date.now\(\)-startedAt < 35_000/)
  assert.match(route, /primary:web_search_recovery/)
  assert.match(route, /getExternalInfo\(recoveryQuery,8,\{bypassCache:true\}\)/)
  assert.match(route, /prepareFreshEvidenceAcrossQueries\(\[freshSources,recoverySearch.results\],8,lookupInput\)/)
  assert.match(route, /freshEvidenceMeetsQuestionAuthority\(lookupInput,recoveredSources\)/)
  assert.match(route, /securityScenarioEvidenceIsSpecific\(lookupInput,recoveredSources\)/)
  assert.match(route, /synthesizeFreshEvidenceLocally\(\{input:lookupInput,sources:freshSources,retrievedAt:freshRetrievedAt,language\}\)/)
  assert.match(route, /fresh_grounding_research_recovery_finished/)
  assert.match(route, /recoveredSources.some\(source=>!freshSources.some\(existing=>existing.url===source.url\)\)/)
  assert.doesNotMatch(route, /recoveredSources.length > freshSources.length/)
})



test('the reasoning call sees question-bearing excerpts, not pages: 8 × 24k-char sources stay inside the evidence budget', () => {
  // Production 2026-10-10 19:56: 9,422 prompt tokens, 700 output tokens, 19.4 s, finish=length; all other attempts timed out.
  const filler = 'The committee discussed procurement of office furniture for the regional branch and adjourned without further business. '
  const key = 'In Brazil, Flávio Bolsonaro won 47.03% of valid votes in the first presidential round and faces Lula in a runoff on October 25, 2026. '
  const page = (filler.repeat(120) + key + filler.repeat(110)).slice(0, 24_000)
  const big: FreshEvidenceSource[] = Array.from({ length: 8 }, (_, index) => ({
    id: `LIVE${index + 1}`, title: `Report ${index + 1}`, url: `https://host${index + 1}.example/brazil-election`, snippet: page, sourceDate: '2026-10-05',
  }))
  const compact = compactFreshEvidenceForReasoning(big, officeQuestion)
  const evidenceChars = compact.reduce((sum, source) => sum + source.snippet.length, 0)
  assert.ok(evidenceChars <= FRESH_GROUNDED_EVIDENCE_CHARS_TOTAL, `evidence ${evidenceChars} > ${FRESH_GROUNDED_EVIDENCE_CHARS_TOTAL}`)
  for (const source of compact) {
    assert.ok(source.snippet.length <= FRESH_GROUNDED_EVIDENCE_CHARS_PER_SOURCE)
    assert.match(source.snippet, /runoff on October 25, 2026/, 'the passage that answers the question is kept')
    assert.doesNotMatch(source.snippet, /office furniture/, 'irrelevant passages are dropped')
  }
  const prompt = freshEvidenceGroundedAnswerPrompt({ input: officeQuestion, sources: big, retrievedAt, language: 'en', lengthRule: 'CHAT ANSWER LENGTH: test rule' })
  assert.ok(prompt.prompt.length < 11_000, `prompt ${prompt.prompt.length} chars`)
  assert.ok(prompt.systemPrompt.length < 3_500, `system ${prompt.systemPrompt.length} chars`)
  // ids, urls and dates are untouched, so citations and the Sources line still resolve
  assert.deepEqual(compact.map(source => [source.id, source.url, source.sourceDate]), big.map(source => [source.id, source.url, source.sourceDate]))
})

test('excerpting keeps short sources whole and never empties a source with no matching passage', () => {
  assert.equal(excerptEvidenceForQuestion('Short official notice.', officeQuestion, 1_200), 'Short official notice.')
  const unrelated = 'Alpha beta gamma. '.repeat(200)
  const kept = excerptEvidenceForQuestion(unrelated, officeQuestion, 300)
  assert.ok(kept.length > 0 && kept.length <= 300)
})
