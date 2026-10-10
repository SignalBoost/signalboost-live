// saas/tests/officeHolderEvidenceRule.node.test.ts
//
// Regression for the 2026-10-10 failure class: any question naming a public office was refused
// ("COS requires live authoritative evidence … live verification is unavailable or insufficient")
// unless a `.gov`-style host was among the search results, even when several independent reputable
// reports agreed. Election outcomes, leader statements and successions are rarely published on a
// state site, and non-US states (gob.mx, gouv.fr, bund.de, tse.jus.br, …) never matched `.gov`.
// The rule is now: institutional publisher (any country) OR two independent hosts; one
// uncorroborated secondary page still fails. The same rule governs the pre-synthesis evidence gate
// and the post-synthesis citation check, so they cannot disagree.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  freshEvidenceMeetsAuthority,
  freshEvidenceGroundingBlock,
  officeHolderEvidenceSatisfied,
  replyCitesIndependentFreshEvidence,
  type FreshEvidenceSource,
} from '../lib/ai/cos/cosFreshGrounding.ts'
import { freshEvidenceMeetsQuestionAuthority, replyCitesRequiredFreshEvidence } from '../lib/ai/cos/cosFreshAuthority.ts'
import { isInstitutionalHost } from '../lib/ai/cos/officialSourceAuthority.ts'

const reports: FreshEvidenceSource[] = [
  { id: 'LIVE1', title: 'Candidate A edges Candidate B in the first round', url: 'https://en.mercopress.com/2026/10/05/first-round', snippet: 'Candidate A won around 47% of valid votes; runoff on October 25.' },
  { id: 'LIVE2', title: 'Candidates head to runoff', url: 'https://www.chinadailyhk.com/article/640532', snippet: 'No candidate secured a majority; runoff on Oct 25.' },
  { id: 'LIVE3', title: 'Runoff set after first round', url: 'https://www.reuters.com/world/americas/runoff-2026', snippet: 'The two front-runners advance to a second round.' },
]
const oneReport = reports.slice(0, 1)
const sameHostTwice: FreshEvidenceSource[] = [reports[0], { ...reports[0], id: 'LIVE2', url: 'https://en.mercopress.com/2026/10/06/analysis' }]
const electoralCourt: FreshEvidenceSource[] = [{ id: 'LIVE1', title: 'Resultados — eleições 2026', url: 'https://resultados.tse.jus.br/oficial/app/index.html', snippet: '47,04% · 45,14% — 99,94% das urnas apuradas' }]

const officeQuestions = [
  'who will be the next brazilian president?',
  'who is the president of Brazil?',
  'what did the prime minister of Canada say today about tariffs?',
  'who is the current mayor of Paris?',
  'who will succeed the pope?',
]

test('office questions pass with two independent reporting hosts and no state site', () => {
  for (const question of officeQuestions) {
    assert.equal(freshEvidenceMeetsAuthority(question, reports), true, question)
    assert.equal(freshEvidenceMeetsQuestionAuthority(question, reports), true, question)
  }
})

test('office questions still fail closed on one uncorroborated page or one host repeated', () => {
  for (const question of officeQuestions) {
    assert.equal(freshEvidenceMeetsAuthority(question, oneReport), false, question)
    assert.equal(freshEvidenceMeetsAuthority(question, sameHostTwice), false, question)
    assert.equal(freshEvidenceMeetsAuthority(question, []), false, question)
  }
})

test('an institutional publisher of any country is sufficient on its own', () => {
  for (const host of ['www.gob.mx', 'www.gouv.fr', 'planalto.gov.br', 'whitehouse.gov', 'gov.uk', 'ec.europa.eu']) {
    const single: FreshEvidenceSource[] = [{ id: 'LIVE1', title: 'Official', url: `https://${host}/page`, snippet: 'official page' }]
    assert.equal(isInstitutionalHost(host.replace(/^www\./, '')), true, host)
    assert.equal(officeHolderEvidenceSatisfied(single), true, host)
    assert.equal(freshEvidenceMeetsAuthority('who is the president of the country?', single), true, host)
  }
  // A host outside the institutional convention counts as one independent host, never as a refusal.
  assert.equal(freshEvidenceMeetsAuthority('who is the president of Brazil?', electoralCourt), false)
  assert.equal(freshEvidenceMeetsAuthority('who is the president of Brazil?', [...electoralCourt, { ...reports[0], id: 'LIVE2' }]), true)
})

test('the citation check applies the same rule as the evidence gate', () => {
  const question = 'who will be the next brazilian president?'
  const twoCited = `Per reporting, the runoff is on 25 October [LIVE1] (${reports[0].url}) [LIVE2] (${reports[1].url}); no winner is declared.`
  const oneCited = `The runoff is on 25 October [LIVE1] (${reports[0].url}).`
  const courtCited = `Official count: 47.04% vs 45.14% [LIVE1] (${electoralCourt[0].url}) [LIVE2] (${reports[0].url}).`
  assert.equal(replyCitesIndependentFreshEvidence(twoCited, question, reports), true)
  assert.equal(replyCitesRequiredFreshEvidence(twoCited, question, reports), true)
  assert.equal(replyCitesIndependentFreshEvidence(oneCited, question, reports), false)
  assert.equal(replyCitesIndependentFreshEvidence(courtCited, question, [...electoralCourt, { ...reports[0], id: 'LIVE2' }]), true)
})

test('the synthesis contract tells the reasoner to attribute reporting and never declare a future winner', () => {
  const block = freshEvidenceGroundingBlock('who will be the next brazilian president?', reports, '2026-10-10T07:00:00.000Z')
  assert.match(block, /as reported by/)
  assert.match(block, /not officially confirmed/)
  assert.match(block, /never an established fact until the evidence reports a declared official result/)
})

test('cases carried from the superseded forward-looking test: national gov domains, other offices, one vs two sources', () => {
  const source = (id: string, url: string): FreshEvidenceSource => ({ id, title: 'Election coverage', url, snippet: 'First round results and runoff candidates', sourceDate: '2026-10-09' })
  const twoNewsHosts = [source('LIVE1', 'https://www.reuters.com/world/americas/brazil-election-2026'), source('LIVE2', 'https://www.bbc.com/news/brazil-election-2026')]
  for (const question of ['who will be the next brazilian president?', 'Who is the current president of Brazil?', 'Who are the candidates for mayor of New York?', 'What do the polls say about the next president of Mexico?']) {
    assert.equal(freshEvidenceMeetsQuestionAuthority(question, twoNewsHosts), true, question)
    assert.equal(freshEvidenceMeetsQuestionAuthority(question, [twoNewsHosts[0]]), false, question)
  }
  assert.equal(freshEvidenceMeetsQuestionAuthority('Who will be the next prime minister of Japan?', [source('LIVE1', 'https://www.nhk.or.jp/a'), source('LIVE2', 'https://www.japantimes.co.jp/b')]), true)
  for (const url of ['https://www.gov.br/planalto/pt-br', 'https://www.gob.mx/presidencia', 'https://www.elysee.gouv.fr/', 'https://www.whitehouse.gov/']) {
    assert.equal(freshEvidenceMeetsQuestionAuthority('Who is the current president of Brazil?', [source('LIVE1', url)]), true, url)
  }
  assert.equal(freshEvidenceMeetsQuestionAuthority('Who is the current president of Brazil?', [source('LIVE1', 'https://government-news.com/x')]), false)
  const both = `Runoff on 25 October [LIVE1](${twoNewsHosts[0].url}) and [LIVE2](${twoNewsHosts[1].url}).`
  const one = `Runoff on 25 October [LIVE1](${twoNewsHosts[0].url}).`
  assert.equal(replyCitesIndependentFreshEvidence(both, 'who will be the next brazilian president?', twoNewsHosts), true)
  assert.equal(replyCitesIndependentFreshEvidence(one, 'who will be the next brazilian president?', twoNewsHosts), false)
  assert.match(freshEvidenceGroundingBlock('who will be the next brazilian president?', twoNewsHosts, '2026-10-10T07:00:00Z'), /never turn a poll lead, a first-round lead, or incumbency into a predicted or declared winner/)
})

test('non-office current facts keep the existing one-source floor', () => {
  assert.equal(freshEvidenceMeetsAuthority('what is the population of Lisbon?', oneReport), true)
})
