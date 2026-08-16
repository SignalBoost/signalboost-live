import assert from 'node:assert/strict'
import test from 'node:test'
import { requiresFreshExternalEvidence } from '@/lib/ai/cos/cosFreshnessPolicy'

test('current US president requires live external verification', () => {
  assert.equal(requiresFreshExternalEvidence('Who is the current President of the United States?'), true)
  assert.equal(requiresFreshExternalEvidence('Who is the President of the United States?'), true)
  assert.equal(requiresFreshExternalEvidence('Who is currently the president of the United States?”'), true)
  assert.equal(requiresFreshExternalEvidence('Is Donald Trump still the President of the United States?'), true)
})

test('volatile operational facts require live verification even without the word current', () => {
  assert.equal(requiresFreshExternalEvidence('Who is the CEO of Apple?'), true)
  assert.equal(requiresFreshExternalEvidence('What is the TSLA stock price?'), true)
  assert.equal(requiresFreshExternalEvidence('What is the USD to EUR exchange rate?'), true)
  assert.equal(requiresFreshExternalEvidence('Weather in Paramaribo?'), true)
  assert.equal(requiresFreshExternalEvidence('What is the NBA score?'), true)
  assert.equal(requiresFreshExternalEvidence('NBA standings'), true)
  assert.equal(requiresFreshExternalEvidence('Is there a service outage?'), true)
  assert.equal(requiresFreshExternalEvidence('What is flight status for AA123?'), true)
  assert.equal(requiresFreshExternalEvidence('What is traffic like in Warsaw?'), true)
  assert.equal(requiresFreshExternalEvidence('What is the election result?'), true)
})

test('explicit freshness wording forces live verification across volatile domains', () => {
  assert.equal(requiresFreshExternalEvidence('Who is the current CEO of Apple?'), true)
  assert.equal(requiresFreshExternalEvidence('What is the exchange rate right now?'), true)
  assert.equal(requiresFreshExternalEvidence("What is today's weather forecast?"), true)
  assert.equal(requiresFreshExternalEvidence('What are the latest NBA standings?'), true)
  assert.equal(requiresFreshExternalEvidence('What is the breaking news from Warsaw?'), true)
  assert.equal(requiresFreshExternalEvidence('What are the recent election results?'), true)
  assert.equal(requiresFreshExternalEvidence('Is there a live service outage?'), true)
  assert.equal(requiresFreshExternalEvidence('What is the current regulation on this issue?'), true)
  assert.equal(requiresFreshExternalEvidence('What is the latest software release?'), true)
})

test('historical and conceptual questions do not masquerade as current-world lookups', () => {
  assert.equal(requiresFreshExternalEvidence('Who was President of the United States in 1999?'), false)
  assert.equal(requiresFreshExternalEvidence('What was the TSLA stock price in 2020?'), false)
  assert.equal(requiresFreshExternalEvidence('Explain how stock prices work.'), false)
  assert.equal(requiresFreshExternalEvidence('How does weather forecasting work?'), false)
  assert.equal(requiresFreshExternalEvidence('How is a prime minister elected?'), false)
  assert.equal(requiresFreshExternalEvidence('Explain database transaction isolation levels.'), false)
  assert.equal(requiresFreshExternalEvidence('Diagnose enterprise-only API latency with normal database CPU.'), false)
})
