import assert from 'node:assert/strict'
import test from 'node:test'
import {
  freshEvidenceMeetsQuestionAuthority,
  replyCitesRequiredFreshEvidence,
} from '../lib/ai/cos/cosFreshAuthority.ts'
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
