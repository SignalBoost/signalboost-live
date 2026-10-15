import assert from 'node:assert/strict'
import test from 'node:test'
import {
  freshEvidenceMeetsQuestionAuthority,
  replyCitesRequiredFreshEvidence,
} from '../lib/ai/cos/cosFreshAuthority.ts'
import { classifyAuthoritativeSourceNeed } from '../lib/ai/cos/officialSourceAuthority.ts'
import { prepareFreshEvidence } from '../lib/ai/cos/cosFreshGrounding.ts'

const sources = prepareFreshEvidence([
  { title: 'Source one', url: 'https://news.example/person', snippet: 'Example Person died on August 16, 2026.' },
  { title: 'Source two', url: 'https://reference.example/person', snippet: 'Example Person died on August 16, 2026.' },
])

test('life-status authority requires two independent hosts', () => {
  assert.equal(freshEvidenceMeetsQuestionAuthority('When did Example Person die?', sources.slice(0, 1)), false)
  assert.equal(freshEvidenceMeetsQuestionAuthority('When did Example Person die?', sources), true)
})

test('life-status synthesis must cite two independent sources', () => {
  const one = `August 16, 2026. [${sources[0].id}] (${sources[0].url})`
  assert.equal(replyCitesRequiredFreshEvidence(one, 'When did Example Person die?', sources), false)

  const two = `August 16, 2026. [${sources[0].id}] (${sources[0].url}) and [${sources[1].id}] (${sources[1].url})`
  assert.equal(replyCitesRequiredFreshEvidence(two, 'When did Example Person die?', sources), true)
})

test('ordinary fresh facts preserve the existing one-source floor', () => {
  assert.equal(freshEvidenceMeetsQuestionAuthority('What is the current software version?', sources.slice(0, 1)), true)
})

test('regulated guidance rejects secondary-only live evidence', () => {
  const secondary = prepareFreshEvidence([
    { title: 'Commercial legal explainer', url: 'https://example.com/gdpr-breach', snippet: 'Summary', authorityTier: 'secondary' },
  ])
  assert.equal(freshEvidenceMeetsQuestionAuthority('What are the current GDPR breach notification requirements?', secondary), false)

  const institutional = prepareFreshEvidence([
    { title: 'EDPB guidance', url: 'https://edpb.europa.eu/guidance', snippet: 'Summary', authorityTier: 'institutional' },
  ])
  assert.equal(freshEvidenceMeetsQuestionAuthority('What are the current GDPR breach notification requirements?', institutional), true)
})

test('news identification about lawmakers does not require a government publisher', () => {
  const reporting = prepareFreshEvidence([
    { title: 'Independent report A', url: 'https://news-one.example/story', snippet: 'Federal investigators searched the home of an elected representative.' },
    { title: 'Independent report B', url: 'https://news-two.example/story', snippet: 'The search was confirmed by authorities.' },
  ])
  const prompt = "Which US law maker's house was recently raided by Homeland Security?"
  assert.equal(classifyAuthoritativeSourceNeed(prompt).required, false)
  assert.equal(freshEvidenceMeetsQuestionAuthority(prompt, reporting), true)
  assert.equal(classifyAuthoritativeSourceNeed('Which law enforcement agency conducted a recent search?').required, false)
  assert.equal(classifyAuthoritativeSourceNeed('Which law firm represented the plaintiff?').required, false)
  assert.equal(classifyAuthoritativeSourceNeed('Which law school published the study?').required, false)
})

test('actual laws and regulatory procedure questions still require authoritative sources', () => {
  const reporting = prepareFreshEvidence([{ title: 'Commentary', url: 'https://news-one.example/law', snippet: 'News commentary.' }])
  for (const prompt of ['What law applies to registration?', 'Which laws govern the permit?', 'What are the current immigration law requirements?']) {
    assert.equal(classifyAuthoritativeSourceNeed(prompt).required, true)
    assert.equal(freshEvidenceMeetsQuestionAuthority(prompt, reporting), false)
  }
})
