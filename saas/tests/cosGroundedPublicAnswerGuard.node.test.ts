import test from 'node:test'
import assert from 'node:assert/strict'
import { acceptFreshEvidenceGroundedAnswer, freshEvidenceGroundedAnswerPrompt } from '../lib/ai/cos/freshEvidenceGroundedAnswer.ts'
const sources = [{id:'LIVE1',title:'Salsa socials',url:'https://salsavida.com/guides/paraguay/asuncion/socials/',snippet:'Salsa socials in Asuncion'}]
const input = 'Are there salsa dancing clubs in Asuncion?'
test('answer prompt requests no-thinking and short final answer', () => {
 const prompt=freshEvidenceGroundedAnswerPrompt({input,sources,retrievedAt:'2026-10-11T00:00:00Z',language:'en'})
 assert.match(prompt.prompt,/^\/no_think/)
 assert.match(prompt.prompt,/Return ONLY the final answer/)
})
test('explicit think block is discarded before citation validation', () => {
 const result=acceptFreshEvidenceGroundedAnswer({input,sources,text:'<think>We are given a question. [LIVE1]</think>Yes, salsa socials are listed in Asuncion. [LIVE1]'})
 assert.equal(result.ok,true)
 assert.doesNotMatch(result.reply,/We are given/)
})
test('analysis with inline citations cannot be published', () => {
 const result=acceptFreshEvidenceGroundedAnswer({input,sources,text:'We are given a question about salsa clubs. [LIVE1] Let us analyze the source.'})
 assert.equal(result.ok,false)
})
test('unmarked thinking does not become evidence through citation normalization', () => {
 const result=acceptFreshEvidenceGroundedAnswer({input,sources,text:'We must answer using evidence. 【LIVE1】'})
 assert.equal(result.ok,false)
})
test('explicit final section can be accepted without publishing preceding analysis', () => {
 const result=acceptFreshEvidenceGroundedAnswer({input,sources,text:'We are given a question. [LIVE1]\nFINAL ANSWER: Yes, there are salsa social listings. [LIVE1]'})
 assert.equal(result.ok,true)
 assert.doesNotMatch(result.reply,/We are given/)
})
test('harmless source attribution is removed but supported content remains', () => {
 const result=acceptFreshEvidenceGroundedAnswer({input,sources,text:'Based on the live sources: Salsa social events are listed in Asuncion. [LIVE1]'})
 assert.equal(result.ok,true)
 assert.match(result.reply,/Salsa social events are listed/)
 assert.doesNotMatch(result.reply,/Based on the live sources/i)
})
test('analysis is still rejected even after an attribution preface', () => {
 const result=acceptFreshEvidenceGroundedAnswer({input,sources,text:'According to the retrieved evidence: We must analyze each source. [LIVE1]'})
 assert.equal(result.ok,false)
 assert.equal(result.reason,'process_narration')
})

test('removes complete reasoning-only opener and keeps supported final answer', () => {
 const result=acceptFreshEvidenceGroundedAnswer({input,sources,text:"Okay, let me tackle this question about salsa. Salsa social events are listed in Asuncion. [LIVE1]"})
 assert.equal(result.ok,true)
 assert.doesNotMatch(result.reply,/let me tackle/i)
 assert.match(result.reply,/Salsa social events are listed/)
})
test('does not strip incomplete reasoning and expose remainder as answer', () => {
 const result=acceptFreshEvidenceGroundedAnswer({input,sources,text:"Let me analyze the evidence and compare sources. [LIVE1] First, I'll inspect each source."})
 assert.equal(result.ok,false)
})
test('narration citations alone never count as a supported answer', () => {
 const result=acceptFreshEvidenceGroundedAnswer({input,sources,text:"First, I'll scan the sources [LIVE1]. We must inspect more."})
 assert.equal(result.ok,false)
})

test('Asuncion source-by-source thinking with citations is never published', () => {
 const draft = "Okay, let's tackle this query. The user is asking about salsa dancing clubs.\nLooking at the evidence sources:\n[LIVE1] is about salsa in social sciences.\n[LIVE2] discusses New York.\n[LIVE3] mentions studios.\nThe key evidence is LIVE3, but studios are not clubs."
 const result=acceptFreshEvidenceGroundedAnswer({input,sources,text:draft})
 assert.equal(result.ok,false)
 assert.equal(result.reason,'process_narration')
})
test('Frankfurt bulleted source inventory is not a final answer', () => {
 const draft = "The evidence retrieved includes sources about Frankfurt.\n- [LIVE1]: a paper about music.\n- [LIVE2]: salsa history.\n- [LIVE3]: a calendar of salsa events."
 const result=acceptFreshEvidenceGroundedAnswer({input,sources,text:draft})
 assert.equal(result.ok,false)
 assert.equal(result.reason,'process_narration')
})
