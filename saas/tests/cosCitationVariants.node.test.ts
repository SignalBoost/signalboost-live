import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeLiveCitations, trimToCompleteSentence, acceptFreshEvidenceGroundedAnswer } from '../lib/ai/cos/freshEvidenceGroundedAnswer.ts'

const sources = [
 { id: 'LIVE1', title: 'First', url: 'https://example.gov/one', snippet: 'First fact' },
 { id: 'LIVE2', title: 'Second', url: 'https://senate.gov/two', snippet: 'Second fact' },
 { id: 'LIVE3', title: 'Third', url: 'https://house.gov/three', snippet: 'Third fact' },
]

test('normalizes explicit citation variants only', () => {
 const variants = ['[LIVE1, LIVE3]', '[LIVE 1; 3]', '(LIVE1)', '【LIVE1】', 'LIVE1', '[live1]']
 for (const variant of variants) {
   const normalized = normalizeLiveCitations(variant)
   assert.match(normalized, /\[LIVE1\]/)
 }
 assert.equal(normalizeLiveCitations('[LIVE1, LIVE3]'), '[LIVE1][LIVE3]')
 assert.equal(normalizeLiveCitations('No citation here.'), 'No citation here.')
})

test('trim preserves citation attached after a period before unfinished remainder', () => {
 const input = 'A complete factual statement about a documented event. [LIVE1] Unfinished remainder'
 assert.equal(trimToCompleteSentence(input), 'A complete factual statement about a documented event. [LIVE1]')
})

test('accepts cited variants but rejects uncited prose', () => {
 const cited = acceptFreshEvidenceGroundedAnswer({ text: 'A supported fact. 【LIVE1】', input: 'What is the fact?', sources })
 assert.equal(cited.ok, true)
 assert.deepEqual(cited.citedSourceIds, ['LIVE1'])
 const uncited = acceptFreshEvidenceGroundedAnswer({ text: 'A fact with no source.', input: 'What is the fact?', sources })
 assert.equal(uncited.ok, false)
 assert.equal(uncited.reason, 'no_evidence_cited')
})