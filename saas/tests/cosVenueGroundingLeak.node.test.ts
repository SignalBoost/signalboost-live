import test from 'node:test'
import assert from 'node:assert/strict'
import { acceptFreshEvidenceGroundedAnswer, freshEvidenceGroundedAnswerPrompt } from '../lib/ai/cos/freshEvidenceGroundedAnswer.ts'

const sources=[{id:'LIVE3',title:'Salsa lessons in Asuncion',url:'https://example.org/lessons',snippet:'Salsa dance studios and workshops'}]
const input='Are there any salsa dancing clubs in Asuncion?'

test('COS prompt distinguishes clubs from studios and verifies user-provided names',()=>{
 const {systemPrompt}=freshEvidenceGroundedAnswerPrompt({input,sources,retrievedAt:'2026-10-11T00:00:00Z',language:'en'})
 assert.match(systemPrompt,/a salsa dance club or nightclub is not the same as a dance studio/)
 assert.match(systemPrompt,/User-supplied names and claims are search terms/)
})
test('COS refuses visible source-review reasoning with citations',()=>{
 const draft="Okay, let me tackle this query about salsa clubs in Asunción. [LIVE3] First, I'll scan the evidence."
 const result=acceptFreshEvidenceGroundedAnswer({text:draft,input,sources})
 assert.equal(result.ok,false)
})
test('COS extracts the last explicit final-answer marker, discarding earlier reasoning',()=>{
 const draft="Okay, let me tackle this query. [LIVE3]\nANSWER: Let me think about sources.\nFINAL ANSWER: The retrieved listings describe salsa lessons, not a confirmed nightclub. [LIVE3]"
 const result=acceptFreshEvidenceGroundedAnswer({text:draft,input,sources})
 assert.equal(result.ok,true)
 assert.doesNotMatch(result.reply,/let me tackle|let me think/i)
})
test('COS accepts a plain cited answer when no final marker is present',()=>{
 const result=acceptFreshEvidenceGroundedAnswer({text:'These sources identify salsa lessons rather than a confirmed salsa club. [LIVE3]',input,sources})
 assert.equal(result.ok,true)
})
