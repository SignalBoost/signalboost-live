import test from 'node:test'
import assert from 'node:assert/strict'
import { acceptFreshEvidenceGroundedAnswer } from '../lib/ai/cos/freshEvidenceGroundedAnswer.ts'

const sources = [
  { id: 'LIVE1', title: 'Official one', url: 'https://example.gov/one', snippet: 'Evidence one' },
  { id: 'LIVE2', title: 'Official two', url: 'https://senate.gov/two', snippet: 'Evidence two' },
]

test('maps explicit numeric citations to the corresponding supplied evidence IDs', () => {
 const result = acceptFreshEvidenceGroundedAnswer({text:'The reports describe separate developments. [1] [2]',input:'What do the reports say?',sources})
 assert.equal(result.ok,true)
 assert.deepEqual(result.citedSourceIds,['LIVE1','LIVE2'])
 assert.match(result.reply,/\[LIVE1\]/)
 assert.match(result.reply,/\[LIVE2\]/)
})
test('does not invent citations for an uncited answer', () => {
 const result=acceptFreshEvidenceGroundedAnswer({text:'An unsupported answer.',input:'What do the reports say?',sources})
 assert.equal(result.ok,false)
 assert.equal(result.reason,'no_evidence_cited')
})
test('does not accept nonexistent numeric citation references', () => {
 const result=acceptFreshEvidenceGroundedAnswer({text:'An unsupported answer. [3]',input:'What do the reports say?',sources})
 assert.equal(result.ok,false)
 assert.equal(result.reason,'no_evidence_cited')
})
