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