import assert from 'node:assert/strict'
import test from 'node:test'
import { requiresFreshExternalEvidence, structuredLiveDataKind } from '../lib/ai/cos/cosFreshnessPolicy.ts'

test('current US president requires live external verification', () => {
  assert.equal(requiresFreshExternalEvidence('Who is the current President of the United States?'), true)
  assert.equal(requiresFreshExternalEvidence('Who is the President of the United States?'), true)
  assert.equal(requiresFreshExternalEvidence('Who is currently the president of the United States?”'), true)
  assert.equal(requiresFreshExternalEvidence('Is Donald Trump still the President of the United States?'), true)
})

test('high-frequency public values require the structured real-time path', () => {
  assert.equal(structuredLiveDataKind('What is the TSLA stock price?'), 'financial')
  assert.equal(structuredLiveDataKind('TSLA stock price'), 'financial')
  assert.equal(structuredLiveDataKind('What is the USD to EUR exchange rate?'), 'financial')
  assert.equal(structuredLiveDataKind('Bitcoin price'), 'financial')
  assert.equal(structuredLiveDataKind('Weather in Paramaribo?'), 'weather')
  assert.equal(structuredLiveDataKind('What is the NBA score?'), 'sports')
  assert.equal(structuredLiveDataKind('NBA standings'), 'sports')
})

test('clearly external volatile facts require live verification even without the word current', () => {
  assert.equal(requiresFreshExternalEvidence('Who is the CEO of Apple?'), true)
  assert.equal(requiresFreshExternalEvidence('What is the TSLA stock price?'), true)
  assert.equal(requiresFreshExternalEvidence('TSLA stock price'), true)
  assert.equal(requiresFreshExternalEvidence('What is the USD to EUR exchange rate?'), true)
  assert.equal(requiresFreshExternalEvidence('Weather in Paramaribo?'), true)
  assert.equal(requiresFreshExternalEvidence('What is the NBA score?'), true)
  assert.equal(requiresFreshExternalEvidence('NBA standings'), true)
  assert.equal(requiresFreshExternalEvidence('Is there a service outage?'), true)
  assert.equal(requiresFreshExternalEvidence('What is flight status for AA123?'), true)
  assert.equal(requiresFreshExternalEvidence('What are traffic conditions in Warsaw?'), true)
  assert.equal(requiresFreshExternalEvidence('What is the election result?'), true)
  assert.equal(requiresFreshExternalEvidence('What is the latest stock market data?'), true)
})

test('explicit freshness wording forces live verification across public volatile domains', () => {
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

test('life-status questions require live verification without an explicit current marker', () => {
  assert.equal(requiresFreshExternalEvidence('When did George Foreman die?'), true)
  assert.equal(requiresFreshExternalEvidence('Is George Foreman alive?'), true)
  assert.equal(requiresFreshExternalEvidence('Has George Foreman passed away?'), true)
})

test('historical and conceptual questions do not masquerade as current-world lookups', () => {
  assert.equal(requiresFreshExternalEvidence('Who was President of the United States in 1999?'), false)
  assert.equal(requiresFreshExternalEvidence('What was the TSLA stock price in 2020?'), false)
  assert.equal(structuredLiveDataKind('What was the TSLA stock price in 2020?'), null)
  assert.equal(requiresFreshExternalEvidence('Explain how stock prices work.'), false)
  assert.equal(structuredLiveDataKind('Explain how stock prices work.'), null)
  assert.equal(requiresFreshExternalEvidence('How does weather forecasting work?'), false)
  assert.equal(requiresFreshExternalEvidence('How is a prime minister elected?'), false)
  assert.equal(requiresFreshExternalEvidence('Explain database transaction isolation levels.'), false)
  assert.equal(requiresFreshExternalEvidence('Diagnose enterprise-only API latency with normal database CPU.'), false)
})

test('internal business and creation requests are not hijacked by public live-data routing', () => {
  assert.equal(requiresFreshExternalEvidence('How should I market my latest product?'), false)
  assert.equal(requiresFreshExternalEvidence('How should I price my latest product?'), false)
  assert.equal(requiresFreshExternalEvidence('Create a marketing plan for my newest product.'), false)
  assert.equal(requiresFreshExternalEvidence('What are the results of my latest campaign?'), false)
  assert.equal(requiresFreshExternalEvidence('What is the availability of my sales team?'), false)
  assert.equal(requiresFreshExternalEvidence('What is our current inventory?'), false)
  assert.equal(requiresFreshExternalEvidence('Schedule my latest campaign for tomorrow.'), false)
  assert.equal(requiresFreshExternalEvidence('Build a stock price dashboard component.'), false)
  assert.equal(structuredLiveDataKind('Build a stock price dashboard component.'), null)
})
