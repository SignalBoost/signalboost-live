// saas/tests/forwardLookingOfficeAuthority.node.test.ts
//
// Production 2026-10-10 (build 1104996): "who will be the next brazilian president?" retrieved two live
// sources and was still refused (cos-fresh-evidence-unavailable). The authority gate treated every
// question containing an office word as a current-holder lookup that needs a government website; no
// government page states a future winner, so every future-office question failed closed.
import assert from 'node:assert/strict'
import test from 'node:test'
import { freshEvidenceMeetsQuestionAuthority } from '../lib/ai/cos/cosFreshAuthority.ts'
import { freshEvidenceGroundingBlock } from '../lib/ai/cos/cosFreshGrounding.ts'
import { isForwardLookingOfficeQuestion, replyCitesIndependentFreshEvidence } from '../lib/ai/cos/cosFreshGroundingBase.ts'

const source = (id: string, url: string) => ({ id, title: 'Election coverage', url, snippet: 'First round results and runoff candidates', sourceDate: '2026-10-09' })
const twoNewsHosts = [source('LIVE1', 'https://www.reuters.com/world/americas/brazil-election-2026'), source('LIVE2', 'https://www.bbc.com/news/brazil-election-2026')]

test('future office-holder questions are recognised for any country or office', () => {
  for (const question of [
    'who will be the next brazilian president?',
    'Who will be the next prime minister of Japan?',
    'Who are the candidates for mayor of New York?',
    'What do the polls say about the next president of Mexico?',
  ]) assert.equal(isForwardLookingOfficeQuestion(question), true, question)
  for (const question of ['Who is the current president of Brazil?', 'who is the president of France?']) {
    assert.equal(isForwardLookingOfficeQuestion(question), false, question)
  }
})

test('a future office-holder question passes with two independent sources and fails with one', () => {
  const question = 'who will be the next brazilian president?'
  assert.equal(freshEvidenceMeetsQuestionAuthority(question, twoNewsHosts as any), true)
  assert.equal(freshEvidenceMeetsQuestionAuthority(question, [twoNewsHosts[0]] as any), false)
  assert.equal(freshEvidenceMeetsQuestionAuthority('Who will be the next prime minister of Japan?', [
    source('LIVE1', 'https://www.nhk.or.jp/a'), source('LIVE2', 'https://www.japantimes.co.jp/b'),
  ] as any), true)
})

test('a future office-holder answer must cite two independent sources', () => {
  const question = 'who will be the next brazilian president?'
  const both = `Runoff on 25 October [LIVE1](${twoNewsHosts[0].url}) and [LIVE2](${twoNewsHosts[1].url}).`
  const one = `Runoff on 25 October [LIVE1](${twoNewsHosts[0].url}).`
  assert.equal(replyCitesIndependentFreshEvidence(both, question, twoNewsHosts as any), true)
  assert.equal(replyCitesIndependentFreshEvidence(one, question, twoNewsHosts as any), false)
})

test('current office-holder questions still require a government source, including national gov domains', () => {
  const question = 'Who is the current president of Brazil?'
  assert.equal(freshEvidenceMeetsQuestionAuthority(question, twoNewsHosts as any), false)
  for (const url of ['https://www.gov.br/planalto/pt-br', 'https://www.gob.mx/presidencia', 'https://www.elysee.gouv.fr/', 'https://www.whitehouse.gov/']) {
    assert.equal(freshEvidenceMeetsQuestionAuthority(question, [source('LIVE1', url)] as any), true, url)
  }
  assert.equal(freshEvidenceMeetsQuestionAuthority(question, [source('LIVE1', 'https://government-news.com/x')] as any), false)
})

test('future office-holder synthesis must answer with stage and candidates and never predict a winner', () => {
  const forward = freshEvidenceGroundingBlock('who will be the next brazilian president?', twoNewsHosts as any, '2026-10-10T07:00:00Z')
  assert.match(forward, /FUTURE OFFICE-HOLDER QUESTION/)
  assert.match(forward, /Never convert a poll lead into a predicted winner/)
  assert.match(forward, /Do not answer "insufficient" merely because the winner is undecided/)
  const current = freshEvidenceGroundingBlock('Who is the current president of Brazil?', twoNewsHosts as any, '2026-10-10T07:00:00Z')
  assert.doesNotMatch(current, /FUTURE OFFICE-HOLDER QUESTION/)
})
