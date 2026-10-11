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

test('rejects production source-by-source reasoning and preserves the rejection reason', () => {
 const result=acceptFreshEvidenceGroundedAnswer({input,sources,text:'Okay, let us tackle this question. [LIVE1] is about salsa. [LIVE2] discusses dance history.'})
 assert.equal(result.ok,false)
 assert.equal(result.reason,'process_narration')
})

test('salvages a separately cited factual answer after source-by-source reasoning', () => {
 const text = "Looking at the evidence sources:\n[LIVE1] discusses salsa socials in Asuncion.\nThe relevant information is in the event list.\n\nSalsa social dancing events are listed in Asuncion. [LIVE1]"
 const result=acceptFreshEvidenceGroundedAnswer({input,sources,text})
 assert.equal(result.ok,true)
 assert.match(result.reply,/Salsa social dancing events/)
 assert.doesNotMatch(result.reply,/Looking at|discusses salsa|relevant information/)
})
test('cannot reuse a discarded source citation to validate an uncited tail', () => {
 const text = "[LIVE1] discusses a salsa listing.\n\nSalsa dancing clubs have weekly events."
 const result=acceptFreshEvidenceGroundedAnswer({input,sources,text})
 assert.equal(result.ok,false)
})
test('does not accept a source inventory without a separate factual answer', () => {
 const text = "Looking at the evidence sources:\n[LIVE1] discusses salsa social events."
 const result=acceptFreshEvidenceGroundedAnswer({input,sources,text})
 assert.equal(result.ok,false)
 assert.equal(result.reason,'process_narration')
})

test('short independently cited answers survive salvage regardless of length', () => {
 const result=acceptFreshEvidenceGroundedAnswer({
  input,sources,
  text:'[LIVE1] discusses salsa socials.\n\nYes. [LIVE1]',
 })
 assert.equal(result.ok,true)
 assert.equal(result.answer,'Yes. [LIVE1]')
})
test('an uncited closing statement never borrows citations from the walkthrough', () => {
 const result=acceptFreshEvidenceGroundedAnswer({
  input,sources,
  text:'[LIVE1] discusses salsa socials.\n\nYes, clubs are open nightly.',
 })
 assert.equal(result.ok,false)
})

test('rejects the actual salsa club failure which narrates studio evidence instead of answering', () => {
 const text='The strongest evidence comes from [LIVE1] and [LIVE2] which explicitly name dance studios/academies.'
 const result=acceptFreshEvidenceGroundedAnswer({input,sources:[...sources,{id:'LIVE2',title:'Dance academies',url:'https://example.org/academies',snippet:'Dance academies'}],text})
 assert.equal(result.ok,false)
 assert.equal(result.reason,'process_narration')
 assert.equal(result.reply,'')
})
test('preserves an actual caveated customer answer about salsa socials', () => {
 const text='Salsa social dancing events are listed in Asuncion, but a permanent salsa-only nightclub is not confirmed. [LIVE1]'
 const result=acceptFreshEvidenceGroundedAnswer({input,sources,text})
 assert.equal(result.ok,true)
 assert.match(result.reply,/Salsa social dancing events/)
})
