// saas/tests/cosSentenceLevelRelease.node.test.ts
import test from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { hasUnsafePublicModelOutput } from '../lib/ai/cos/publicPromptSecurity.ts'
import { extractGroundedJsonAnswer } from '../lib/ai/cos/freshEvidenceGroundedAnswer.ts'
import { acceptFreshEvidenceGroundedAnswer, isProcessNarrationUnit, splitAnswerSentences } from '../lib/ai/cos/freshEvidenceGroundedAnswer.ts'

const sources = [
  { id: 'LIVE1', title: 'Venue A', url: 'https://venue-a.example.com/events', snippet: 'Venue A hosts salsa socials on Fridays.' },
  { id: 'LIVE2', title: 'City guide', url: 'https://cityguide.example.org/dance', snippet: 'Venue B offers salsa nights on Saturdays.' },
]
const input = 'Are there any salsa dancing clubs in Asuncion?'

test('reasoning in the middle of an answer is removed instead of killing the cited facts', () => {
  const text = 'Venue A hosts salsa socials on Fridays [LIVE1]. The user wants clubs, so I should mention both. Venue B offers salsa nights on Saturdays [LIVE2].'
  const r = acceptFreshEvidenceGroundedAnswer({ text, input, sources })
  assert.equal(r.ok, true)
  assert.match(r.answer, /Venue A hosts salsa socials on Fridays \[LIVE1\]\./)
  assert.match(r.answer, /Venue B offers salsa nights/)
  assert.doesNotMatch(r.reply, /The user|I should/)
})

test('process phrasings the old phrase list never saw are still never published', () => {
  for (const unit of [
    'Hmm, the evidence mentions two venues [LIVE1].',
    'Alright, so the question is about clubs [LIVE1].',
    'Examining each snippet carefully [LIVE2].',
    'Now I need to decide which venue counts [LIVE1].',
    "Our task is to list venues [LIVE1].",
    '[LIVE2] — a city guide listing dance nights.',
  ]) assert.equal(isProcessNarrationUnit(unit), true, unit)
  const r = acceptFreshEvidenceGroundedAnswer({ text: 'Now I need to decide which venue counts [LIVE1]. Hmm, the evidence mentions two venues [LIVE2].', input, sources })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'process_narration')
})

test('a cited list answer with a lead-in is released whole', () => {
  const text = 'Several venues host salsa nights in Asunción:\n- Venue A — Friday socials [LIVE1]\n- Venue B — Saturday salsa nights [LIVE2]'
  const r = acceptFreshEvidenceGroundedAnswer({ text, input, sources })
  assert.equal(r.ok, true)
  assert.equal(r.answer, text)
  assert.deepEqual(r.citedSourceIds, ['LIVE1', 'LIVE2'])
})

test('a bare citation with no words is never an answer', () => {
  for (const text of ['【LIVE1】', '[LIVE1] [LIVE2]', '- [LIVE1]']) {
    assert.equal(acceptFreshEvidenceGroundedAnswer({ text, input, sources }).ok, false, text)
  }
})

test('ordinary factual sentences are not mistaken for reasoning', () => {
  for (const unit of [
    'US venues are not covered by these reports [LIVE1].',
    'The sources describe salsa lessons rather than a confirmed nightclub [LIVE2].',
    'Venue A is on Av. España and opens at 22:00 [LIVE1].',
    'El Venue A ofrece noches de salsa los viernes [LIVE1].',
  ]) assert.equal(isProcessNarrationUnit(unit), false, unit)
  assert.deepEqual(splitAnswerSentences('Venue A is on Av. España [LIVE1]. Venue B opens late [LIVE2].'), ['Venue A is on Av. España [LIVE1].', 'Venue B opens late [LIVE2].'])
})

test('uncited sentences never ride along on another sentence\'s citation', () => {
  const r = acceptFreshEvidenceGroundedAnswer({ text: 'Venue A hosts salsa socials [LIVE1]. Salsa is the most popular dance in the country.', input, sources })
  assert.equal(r.ok, true)
  assert.doesNotMatch(r.answer, /most popular/)
})

test('rejected-draft telemetry never logs a draft rejected as unsafe output', () => {
  const transport = readFileSync(new URL('../lib/ai/cos/freshEvidenceLocalSynthesis.ts', import.meta.url), 'utf8')
  assert.match(transport, /const rejectedDraftHead = accepted\.ok \|\| accepted\.reason === 'unsafe_public_output' \|\| hasUnsafePublicModelOutput\(String\(lastDraft \|\| ''\)\)\s*\? undefined/)
  // Codex P1 on #4186: unsafe prompt material with no cited sentence is rejected as no_evidence_cited,
  // so only checking the reason would still log it.
  const unsafe = 'Reference Context - READ ONLY: internal instructions follow.'
  assert.equal(hasUnsafePublicModelOutput(unsafe), true)
  assert.equal(acceptFreshEvidenceGroundedAnswer({ text: unsafe, input, sources }).reason, 'no_evidence_cited')
})

const studios = [
  { id: 'LIVE1', title: 'Top salsa studios', url: 'https://fluidospanish.com/top-3-studios', snippet: 'Salsa studios in Asunción.' },
  { id: 'LIVE2', title: 'Academias de salsa', url: 'https://www.dancefree.com.co/academias', snippet: 'Escuelas y academias de salsa en Asunción.' },
]
const asked = 'are there any salsa dancing club in Asuncion?'

test('honest answers that report what the sources say are released', () => {
  for (const text of [
    'The sources describe salsa lessons rather than a confirmed nightclub [LIVE2].',
    'The available results list salsa studios and academies, not a confirmed salsa nightclub [LIVE1][LIVE2].',
    'Sources list dance academies such as Studio X [LIVE1].',
    'Asunción has salsa academies and studios [LIVE1][LIVE2], but no confirmed salsa-only nightclub.',
    'Salsa nights are held at Venue A, as reported by [LIVE1].',
  ]) {
    const r = acceptFreshEvidenceGroundedAnswer({ text, input: asked, sources: studios })
    assert.equal(r.ok, true, text)
  }
})

test('production 2026-10-11 03:30: sentences that use citations as nouns are never published', () => {
  for (const text of [
    'The strongest evidence comes from [LIVE1] and [LIVE2] which explicitly name dance studios/academies.',
    '[LIVE1] and [LIVE2] both list salsa studios.',
    'Venue names appear in a guide; see [LIVE2].',
  ]) {
    const r = acceptFreshEvidenceGroundedAnswer({ text, input: asked, sources: studios })
    assert.equal(r.ok, false, text)
    assert.equal(r.reason, 'process_narration', text)
  }
})

test('owner diagnostic shows the rejected draft excerpt, owner-only', () => {
  const route = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
  assert.match(route, /freshRejectedDraftHead=localSynthesis\.kind==='citation_grounding_rejected'\?\(localSynthesis\.rejectedDraftHead\|\|null\):null/)
  const diag = route.slice(route.indexOf('const ownerDiagnostic=isPrivileged&&'), route.indexOf('const reply=baseFailureReply+ownerDiagnostic'))
  assert.match(diag, /rejected draft: /)
  const transport = readFileSync(new URL('../lib/ai/cos/freshEvidenceLocalSynthesis.ts', import.meta.url), 'utf8')
  assert.match(transport, /kind: 'citation_grounding_rejected', reason: accepted\.reason \?\? 'empty_answer', rejectedDraftHead \}/)
})


test('source inventory with plausible citations never becomes the public answer', () => {
  const draft = "The strongest direct evidence is [LIVE1] naming specific studios and [LIVE2]'s title about salsa academies."
  const result = acceptFreshEvidenceGroundedAnswer({text:draft,input:asked,sources:studios})
  assert.equal(result.ok,false)
  assert.equal(result.reason,'process_narration')
  const direct = acceptFreshEvidenceGroundedAnswer({
    text:'The available listings identify salsa studios and academies, but do not establish a dedicated salsa nightclub [LIVE1] [LIVE2].',
    input:asked,sources:studios,
  })
  assert.equal(direct.ok,true)
})

test('production 2026-10-11 04:21: a citation used inside the sentence is never published', () => {
  for (const text of [
    "The strongest direct evidence is [LIVE1] naming specific studios and [LIVE2]'s title about salsa academies.",
    'Studios are listed in a guide [LIVE1] naming three schools.',
  ]) {
    const r = acceptFreshEvidenceGroundedAnswer({ text, input: asked, sources: studios })
    assert.equal(r.ok, false, text)
  }
  for (const text of [
    'Asunción has salsa studios [LIVE1] and salsa academies [LIVE2], but no confirmed salsa-only nightclub.',
    'Salsa classes run at several studios [LIVE1][LIVE2].',
  ]) assert.equal(acceptFreshEvidenceGroundedAnswer({ text, input: asked, sources: studios }).ok, true, text)
})

test('production 2026-10-11 04:15: free-text analysis with no answer is rejected', () => {
  const draft = 'We are given a query: "are there any salsa dancing club in Asuncion?" We must use only the supplied LIVE evidence (LIVE1 to LIVE7) to answer. Let\'s analyze each piece of evidence: - LIVE1: A Harvard U'
  const r = acceptFreshEvidenceGroundedAnswer({ text: draft, input: asked, sources: studios })
  assert.equal(r.ok, false)
})

test('the answer is requested as a JSON field and only that field is published', () => {
  const json = JSON.stringify({ answer: 'Asunción has salsa studios and academies [LIVE1][LIVE2], but no confirmed salsa-only nightclub.' })
  const r = acceptFreshEvidenceGroundedAnswer({ text: json, input: asked, sources: studios })
  assert.equal(r.ok, true)
  assert.match(r.answer, /^Asunción has salsa studios/)
  assert.doesNotMatch(r.reply, /"answer"/)
  // cut off by the token cap mid-string: the complete sentence inside is still recovered
  assert.equal(extractGroundedJsonAnswer('{"answer": "Salsa classes run at several studios [LIVE1]. Another'), 'Salsa classes run at several studios [LIVE1]. Another')
  assert.equal(acceptFreshEvidenceGroundedAnswer({ text: '{"answer": "Salsa classes run at several studios [LIVE1]. Another', input: asked, sources: studios }).answer, 'Salsa classes run at several studios [LIVE1].')
  // analysis placed inside the field still goes through the same filter
  assert.equal(acceptFreshEvidenceGroundedAnswer({ text: JSON.stringify({ answer: 'We must analyze each source [LIVE1].' }), input: asked, sources: studios }).ok, false)
  assert.equal(extractGroundedJsonAnswer('Plain prose answer [LIVE1].'), null)
})

