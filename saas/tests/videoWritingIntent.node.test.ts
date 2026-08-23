import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { classifyCampaignIntent } from '../lib/outreach/campaignIntent.ts'

const CONCIERGE_SOURCE = readFileSync(new URL('../app/api/concierge/route.ts', import.meta.url), 'utf8')
const ORCHESTRATION_SOURCE = readFileSync(new URL('../lib/ai/cos/cosOrchestrationEnterprise.ts', import.meta.url), 'utf8')

const EXACT_PROMPT = 'Write a video about ‘the new update’ without assuming what the update contains.'

test('exact production prompt falls through campaign routing as a writing task', () => {
  const intent = classifyCampaignIntent(EXACT_PROMPT)
  assert.equal(intent.decision, 'not-a-brief')
  assert.equal(intent.pipeline, null)
  assert.deepEqual(intent.prohibited, [])
})

test('concierge only emits campaign miss text when campaignBriefMiss returns a real miss', () => {
  assert.match(CONCIERGE_SOURCE, /const miss = campaignBriefMiss\(input\)/)
  assert.match(CONCIERGE_SOURCE, /if \(!miss\) return null/)
})

test('writing is not an external-action verb in COS orchestration while production verbs remain governed', () => {
  assert.doesNotMatch(ORCHESTRATION_SOURCE, /explicitExecution=.*\bwrite\b/)
  assert.match(ORCHESTRATION_SOURCE, /run\|execute\|perform/)
  assert.match(ORCHESTRATION_SOURCE, /render\|rendering/)
})
