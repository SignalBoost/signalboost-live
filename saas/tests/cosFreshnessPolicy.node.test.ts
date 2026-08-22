import assert from 'node:assert/strict'
import test from 'node:test'
import { requiresFreshExternalEvidence, structuredLiveDataKind } from '../lib/ai/cos/cosFreshnessPolicy.ts'

test('current public role holders require live external verification', () => {
  assert.equal(requiresFreshExternalEvidence('Who is the current President of the United States?'), true)
  assert.equal(requiresFreshExternalEvidence('Who is the President of the United States?'), true)
  assert.equal(requiresFreshExternalEvidence('Who is currently the president of the United States?”'), true)
  assert.equal(requiresFreshExternalEvidence('Is Donald Trump still the President of the United States?'), true)
  assert.equal(requiresFreshExternalEvidence('Who is the CEO of Apple?'), true)
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

test('general mutable external facts route live even when the user does not say current', () => {
  for (const prompt of [
    'When did George Foreman die?',
    'when Hulk Hogan died?',
    'Is this public figure alive?',
    'Has this actor passed away?',
    'Is Acme still in business?',
    'Is that package still maintained?',
    'What is the latest Node.js release?',
    'What is the current visa requirement for entry?',
    'Is CVE-2026-12345 still unpatched?',
    'What happened this month in the industry?',
    'Is there a service outage?',
    'What is flight status for AA123?',
    'What are traffic conditions in Warsaw?',
    'What is the election result?',
  ]) {
    assert.equal(requiresFreshExternalEvidence(prompt), true, prompt)
  }
})

test('ordinary external factual lookups are live-verified by default', () => {
  for (const prompt of [
    "What is Poland's population?",
    'Where is OpenAI headquartered?',
    'Who owns Volvo Cars?',
    'What is the capital of Kazakhstan?',
    'Which country has the largest population?',
    'Tell me about Nvidia.',
    'How many people live in Warsaw?',
    'What languages are officially recognized in South Africa?',
    'When was SpaceX founded?',
    'Is Lufthansa a member of Star Alliance?',
  ]) {
    assert.equal(requiresFreshExternalEvidence(prompt), true, prompt)
  }
})

test('explicit freshness wording forces live verification across volatile public domains', () => {
  for (const prompt of [
    'Who is the current CEO of Apple?',
    'What is the exchange rate right now?',
    "What is today's weather forecast?",
    'What are the latest NBA standings?',
    'What is the breaking news from Warsaw?',
    'What are the recent election results?',
    'Is there a live service outage?',
    'What is the current regulation on this issue?',
    'What is the latest software release?',
    'What is the current security advisory status?',
  ]) {
    assert.equal(requiresFreshExternalEvidence(prompt), true, prompt)
  }
})

test('historical and conceptual questions keep their non-live reasoning route', () => {
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

test('private operational state stays with its system of record instead of public web search', () => {
  for (const prompt of [
    'What is our current pricing?',
    'Is our campaign still running?',
    'What is my latest invoice?',
    'What is our current inventory?',
    'What are the results of our latest campaign?',
    'What is the availability of our sales team?',
    'What is our current MRR?',
    'What is the status of our deployment?',
    'Can you code yourself with iterative model training, dynamic context integration, and procedural skill refinement?',
    'How can COS improve its reasoning?',
    'What are your reasoning capabilities?',
    'What improvements can COS make to its reasoning and skills?',
  ]) {
    assert.equal(requiresFreshExternalEvidence(prompt), false, prompt)
  }
})

test('SignalBoost and COS self-knowledge stays on authoritative internal sources', () => {
  for (const prompt of [
    'What model does COS use now?',
    'What is SignalBoost COS architecture?',
    'How does COS Enterprise Memory work?',
    'What is the COS Semantic Cache policy?',
    'What is the current COS reasoner provider?',
    'Show me COS execution provenance policy.',
  ]) {
    assert.equal(requiresFreshExternalEvidence(prompt), false, prompt)
  }
})

test('local deterministic utilities do not consume public freshness search', () => {
  for (const prompt of [
    'What is 24 * 17?',
    '2 + 2',
    'What is the current date?',
    'What is the time now?',
    'What day is it?',
  ]) {
    assert.equal(requiresFreshExternalEvidence(prompt), false, prompt)
  }
})

test('creation/advice requests are not hijacked by public live-data routing', () => {
  assert.equal(requiresFreshExternalEvidence('How should I market my latest product?'), false)
  assert.equal(requiresFreshExternalEvidence('How should I price my latest product?'), false)
  assert.equal(requiresFreshExternalEvidence('Create a marketing plan for my newest product.'), false)
  assert.equal(requiresFreshExternalEvidence('Schedule my latest campaign for tomorrow.'), false)
  assert.equal(requiresFreshExternalEvidence('Build a stock price dashboard component.'), false)
  assert.equal(structuredLiveDataKind('Build a stock price dashboard component.'), null)
})
