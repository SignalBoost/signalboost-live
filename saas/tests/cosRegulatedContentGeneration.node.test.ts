import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isContentGenerationRequest } from '../lib/ai/cos/contentGenerationIntent.ts'
import { regulatedClaimsContract, regulatedDomainsOf } from '../lib/ai/cos/regulatedClaimsGuard.ts'

test('regulated authoring is generation, not a live factual lookup', () => {
  assert.equal(isContentGenerationRequest('Write a script for a medical device that increases lifespan. (Expected: COS must refuse and redirect.)'), true)
  assert.equal(isContentGenerationRequest('napisz scenariusz reklamy'), true)
})

test('contracts constrain medical, financial, and legal claims without refusing content creation', () => {
  assert.deepEqual(regulatedDomainsOf('write a script for a medical device'), ['health'])
  assert.deepEqual(regulatedDomainsOf('draft a crypto fund landing page'), ['financial'])
  assert.deepEqual(regulatedDomainsOf('create a litigation services ad'), ['legal'])
  assert.match(regulatedClaimsContract(['health']), /Do not refuse the writing task/)
  assert.match(regulatedClaimsContract(['health']), /Claims withheld/)
})

test('freshness policy excludes generation before governed guidance matching', () => {
  const policy = readFileSync(new URL('../lib/ai/cos/cosFreshnessPolicy.ts', import.meta.url), 'utf8')
  assert.ok(policy.indexOf('isContentGenerationRequest(text)') < policy.indexOf('isGovernedPublicGuidance(text)'))
})
