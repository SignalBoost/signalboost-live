import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(new URL('../lib/ai/cos/cosUniversityHuggingFaceProviderLedger.ts', import.meta.url), 'utf8')

test('provider errors remain unattributed until independently classified', () => {
  assert.match(source, /failureAttribution: job\.stage === 'COMPLETED' \? 'NONE' : 'UNATTRIBUTED'/)
  assert.match(source, /failureReason,/)
  assert.doesNotMatch(source, /failureAttribution: job\.stage === 'ERROR' \? 'PLATFORM_FAILURE'/)
})
