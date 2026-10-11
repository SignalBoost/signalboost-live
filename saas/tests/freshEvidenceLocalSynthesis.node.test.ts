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
  trimToCompleteSentence,
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
  assert.match(source, /allowTruncatedText: true/, 'a length-capped answer is kept, not thrown away (prod 2026-10-10 20:35: 4/4 pod answers discarded)')
  assert.equal(FRESH_GROUNDED_ANSWER_TIMEOUT_MS, 20_000)
  assert.equal(FRESH_GROUNDED_ANSWER_MAX_TOKENS, 300)
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

test('a length-capped answer is released after trimming to its last complete sentence', () => {
  const capped = 'It is undecided: the runoff is on 25 October, as reported by [LIVE1] and [LIVE2]. The first round gave Candidate A about 47% [LIVE1]. Polling institutes published on 8 Octo'
  const trimmed = trimToCompleteSentence(capped)
  assert.equal(trimmed, 'It is undecided: the runoff is on 25 October, as reported by [LIVE1] and [LIVE2]. The first round gave Candidate A about 47% [LIVE1].')
  const accepted = acceptFreshEvidenceGroundedAnswer({ text: capped, input: officeQuestion, sources })
  assert.equal(accepted.ok, true)
  assert.doesNotMatch(accepted.answer, /Octo$/)
  // A complete answer is untouched; a short answer cut inside its first sentence is kept rather than emptied.
  assert.equal(trimToCompleteSentence('Done. Really done.'), 'Done. Really done.')
  assert.equal(trimToCompleteSentence('A very long opening sentence that was cut before any period'), 'A very long opening sentence that was cut before any period')
})

test('stale current-year assertions are rejected without banning historical context', () => {
  const year = new Date().getUTCFullYear()
  const previous = year - 3
  const question = 'Which party controls the legislature now?'
  const stale = acceptFreshEvidenceGroundedAnswer({
    input: question, sources,
    text: `As of the current date (${previous}), the legislature is divided. [LIVE1] [LIVE2]`,
  })
  assert.equal(stale.ok, false)
  const historical = acceptFreshEvidenceGroundedAnswer({
    input: question, sources,
    text: `In ${previous}, earlier election cycles had different results. As of the current date (${year}), the runoff is on 25 October, as reported by [LIVE1] and [LIVE2].`,
  })
  assert.equal(historical.ok, true)
})

test('live answers reject exposed analysis and stale as-of framing', () => {
  const narration = acceptFreshEvidenceGroundedAnswer({
    input: officeQuestion, sources,
    text: 'Let me analyze the evidence provided. [LIVE1] [LIVE2]',
  })
  assert.equal(narration.ok, false)
  const stale = acceptFreshEvidenceGroundedAnswer({
    input: officeQuestion, sources,
    text: 'The election is still in the future (as of 2024). [LIVE1] [LIVE2]',
  })
  assert.equal(stale.ok, false)
  const direct = acceptFreshEvidenceGroundedAnswer({
    input: officeQuestion, sources,
    text: 'It is undecided: the first round on 4 October sent Candidate A (about 47%) and Candidate B to a runoff on 25 October, as reported by [LIVE1] and [LIVE2]; no official result is declared yet.',
  })
  assert.equal(direct.ok, true)
  const upcoming = acceptFreshEvidenceGroundedAnswer({
    input: 'Who will control Congress after the 2026 midterms?',
    sources: [
      { id: 'LIVE1', title: 'November 2026 midterm elections', url: 'https://example.org/us-election-guide', snippet: 'The US midterm elections are scheduled for November 3, 2026.' },
      { id: 'LIVE2', title: 'Congress control is undecided', url: 'https://example.net/congress-outlook', snippet: 'Control of the next Congress is not yet decided ahead of the November 2026 vote.' },
    ],
    text: 'The November 2026 election is still upcoming as of October 2026; no future result is established. [LIVE1] [LIVE2]',
  })
  assert.equal(upcoming.ok, true, 'correct future election wording must not be rejected')
})


test('grounded live-answer latency budget caps both generated prose and evidence prefill', () => {
  assert.equal(FRESH_GROUNDED_ANSWER_MAX_TOKENS, 300)
  assert.equal(FRESH_GROUNDED_EVIDENCE_CHARS_PER_SOURCE, 900)
  assert.equal(FRESH_GROUNDED_EVIDENCE_CHARS_TOTAL, 4_500)
  const many = Array.from({ length: 8 }, (_, i) => ({
    id: `LIVE${i + 1}`, title: `Source ${i + 1}`,
    url: `https://source${i + 1}.example.org/election`,
    snippet: 'The midterm election is scheduled for November 3 2026. '.repeat(130),
    sourceDate: '2026-10-10',
  })) as FreshEvidenceSource[]
  const compacted = compactFreshEvidenceForReasoning(many, 'When are the 2026 midterms?')
  assert.ok(compacted.reduce((sum, item) => sum + item.snippet.length, 0) <= 4_500)
  assert.ok(compacted.every(item => item.snippet.length <= 900))
  assert.deepEqual(compacted.map(item => item.id), many.map(item => item.id))
})

test('complete sentences retain trailing live citations instead of losing evidence', () => {
  const complete = 'The November 2026 election is still upcoming as of October 2026; no result is established. [LIVE1] [LIVE2]'
  assert.equal(trimToCompleteSentence(complete), complete)
  const accepted = acceptFreshEvidenceGroundedAnswer({
    text: complete,
    input: 'Who will control Congress after the 2026 midterms?',
    sources: [
      { id: 'LIVE1', title: 'November 2026 midterm elections', url: 'https://example.org/us-election-guide', snippet: 'The US midterm elections are scheduled for November 3, 2026.' },
      { id: 'LIVE2', title: 'Congress control is undecided', url: 'https://example.net/congress-outlook', snippet: 'Control of the next Congress is not yet decided ahead of the November 2026 vote.' },
    ],
  })
  assert.equal(accepted.ok, true)
  assert.deepEqual(accepted.citedSourceIds, ['LIVE1', 'LIVE2'])
})


test('COS election-answer prompt distinguishes chambers, forecasts and certified counts', () => {
  const us = freshEvidenceGroundedAnswerPrompt({input:'Which party will have the majority in the US?',sources,retrievedAt,language:'en'})
  assert.match(us.systemPrompt,/distinguish the House, Senate, and presidency/)
  assert.match(us.systemPrompt,/upcoming election/)
  assert.match(us.systemPrompt,/two-sentence grounded answer/)
  const brazil = freshEvidenceGroundedAnswerPrompt({input:officeQuestion,sources,retrievedAt,language:'en'})
  assert.match(brazil.systemPrompt,/official certified counts from media reports and forecasts/)
  assert.match(brazil.systemPrompt,/Never present a media projection, unverified percentage/)
  assert.match(brazil.systemPrompt,/exact percentages unless they appear explicitly in the cited evidence/)
})


test('narrow narration guard rejects explicit analysis preambles without blocking ordinary sourced answers', () => {
 const attempted = 'Let me analyze the evidence before answering. [LIVE1] [LIVE2]'
 const accepted = acceptFreshEvidenceGroundedAnswer({text:attempted,input:officeQuestion,sources})
 assert.equal(accepted.ok,false)
 assert.equal(accepted.reason,'process_narration')
 const declarative = 'The available reports describe a runoff, not a declared winner. [LIVE1] [LIVE2]'
 assert.equal(acceptFreshEvidenceGroundedAnswer({text:declarative,input:officeQuestion,sources}).ok,true)
 const repair = freshEvidenceGroundedRepairPrompt({input:officeQuestion,sources,retrievedAt,language:'en',draft:attempted,reason:'process_narration'})
 assert.match(repair.systemPrompt,/only the final response/)
})
test('new-question prompt forbids cross-topic evidence reuse', () => {
 const prompt = freshEvidenceGroundedAnswerPrompt({input:'Who will be the next Brazilian president?',sources,retrievedAt,language:'en'})
 assert.match(prompt.systemPrompt,/Never reuse evidence about a different country, election, person, or subject/)
})


test('process narration always gets the bounded repair even after the 12-second first-pass threshold', () => {
  const transport = readFileSync(new URL('../lib/ai/cos/freshEvidenceLocalSynthesis.ts', import.meta.url), 'utf8')
  assert.match(transport, /accepted\.reason === 'process_narration' \|\| Date\.now\(\) - startedAt < 12_000/)
  assert.match(transport, /accepted\.reason !== 'unsafe_public_output'/)
})

test('grounded answer instructions are topic-neutral rather than tied to one example', () => {
  const answerPrompt = freshEvidenceGroundedAnswerPrompt({ input: 'Are there any salsa dancing clubs in Asuncion?', sources, retrievedAt, language: 'en' })
  assert.doesNotMatch(answerPrompt.systemPrompt, /salsa dance club|dance studio, school, academy/i)
  assert.match(answerPrompt.systemPrompt, /Respect the requested category and scope/)
  assert.match(answerPrompt.systemPrompt, /Names, dates, quantities, and specific attributes/)
})

test('grounded prompt repeats question directly before final answer marker', () => {
 const prompt=freshEvidenceGroundedAnswerPrompt({input:officeQuestion,sources,retrievedAt,language:'en'})
 assert.match(prompt.prompt,/QUESTION:[^\n]+\nAnswer in 1–3 short factual sentences\. Start with the factual answer, never with process language\.\nANSWER:\s*$/)
 assert.match(prompt.prompt,/Do not describe or enumerate the evidence sources/)
})

test('new direct-answer prompt gives question before evidence and final answer marker last', () => {
 const prompt=freshEvidenceGroundedAnswerPrompt({input:officeQuestion,sources,retrievedAt,language:'en'})
 assert.ok(prompt.prompt.indexOf('QUESTION:') < prompt.prompt.indexOf('--- LIVE EVIDENCE ---'))
 assert.match(prompt.prompt,/Answer in 1–3 short factual sentences\. Start with the factual answer, never with process language\.\nANSWER:\s*$/)
 const repair=freshEvidenceGroundedRepairPrompt({input:officeQuestion,sources,retrievedAt,language:'en',draft:'We must review [LIVE1].',reason:'process_narration'})
 assert.doesNotMatch(repair.prompt,/PREVIOUS DRAFT/)
 assert.match(repair.prompt,/QUESTION:[^\n]+\nRESPONSE:\s*$/)
})

test('process narration retry uses short independent instructions instead of replaying the first prompt', () => {
 const first=freshEvidenceGroundedAnswerPrompt({input:officeQuestion,sources,retrievedAt,language:'en'})
 const repair=freshEvidenceGroundedRepairPrompt({input:officeQuestion,sources,retrievedAt,language:'en',draft:'We are given a question. [LIVE1]',reason:'process_narration'})
 assert.ok(repair.systemPrompt.length < first.systemPrompt.length)
 assert.doesNotMatch(repair.prompt,/We are given a question|PREVIOUS DRAFT/)
 assert.match(repair.systemPrompt,/Answer the exact category asked/)
 assert.match(repair.prompt,/\nRESPONSE:\s*$/)
})
