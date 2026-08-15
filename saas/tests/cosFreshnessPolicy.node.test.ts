import assert from 'node:assert/strict'
import test from 'node:test'
import { requiresFreshExternalEvidence } from '@/lib/ai/cos/cosFreshnessPolicy'

test('current US president requires live external verification', () => {
  assert.equal(requiresFreshExternalEvidence('Who is the current President of the United States?'), true)
  assert.equal(requiresFreshExternalEvidence('Who is the President of the United States?'), true)
})

test('other volatile current facts require live verification', () => {
  assert.equal(requiresFreshExternalEvidence('Who is the current CEO of Apple?'), true)
  assert.equal(requiresFreshExternalEvidence('What is the exchange rate right now?'), true)
  assert.equal(requiresFreshExternalEvidence("What is today's weather forecast?"), true)
  assert.equal(requiresFreshExternalEvidence('What are the latest NBA standings?'), true)
})

test('historical and stable reasoning questions stay on the local path', () => {
  assert.equal(requiresFreshExternalEvidence('Who was President of the United States in 1999?'), false)
  assert.equal(requiresFreshExternalEvidence('How is a prime minister elected?'), false)
  assert.equal(requiresFreshExternalEvidence('Explain database transaction isolation levels.'), false)
  assert.equal(requiresFreshExternalEvidence('Diagnose enterprise-only API latency with normal database CPU.'), false)
})
