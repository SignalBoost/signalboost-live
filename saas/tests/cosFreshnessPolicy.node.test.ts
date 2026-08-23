// saas/tests/cosFreshnessPolicy.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { requiresFreshExternalEvidence, structuredLiveDataKind } from '../lib/ai/cos/cosFreshnessPolicy.ts'
import { isContentGenerationRequest } from '../lib/ai/cos/contentGenerationIntent.ts'

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

test('a design request that states its situation FIRST is still creation, not a live lookup', () => {
  // Production failure (2026-08-23): the authoring verb was required to be the first word of the
  // whole prompt, so an executive brief that gives three sentences of context before "Design a
  // 90-day..." missed the creation exclusion. The word "current" — describing the company's OWN
  // premium tier, not a current-world fact — then routed it to live evidence, which was
  // unavailable, and the user got a refusal instead of a strategy.
  const brief = 'Gross margins have declined from 74% to 61% over the last two quarters due to soaring third-party inference and API costs. The Head of AI wants to maintain the current premium model tier to protect benchmark leadership, while the CFO demands an immediate migration to quantized open-source weights to restore margins to 70%. Design a 90-day phased optimization strategy that balances latency, model performance, and unit economics.'
  assert.equal(isContentGenerationRequest(brief), true)
  assert.equal(requiresFreshExternalEvidence(brief), false)

  for (const trailing of [
    'Our costs are up. Draft a memo to the board.',
    'Margins fell this quarter. So write me a recovery plan.',
    'The board meets Friday — draft the executive summary.',
  ]) {
    assert.equal(requiresFreshExternalEvidence(trailing), false, trailing)
  }
})

test('an authoring verb buried mid-clause does not fake a creation request', () => {
  // The verb must still LEAD its own clause, or ordinary lookups containing "designed"/"created"
  // would stop being live-verified.
  for (const lookup of [
    'who designed the Eiffel Tower?',
    'who created Python?',
    'which company produces the most lithium?',
  ]) {
    assert.equal(isContentGenerationRequest(lookup), false, lookup)
  }
})

test('a question about COS own prior answer can never become a public web search', () => {
  // Structural safeguard independent of the introspection classifier's accuracy: when that
  // classifier misses, the failure must degrade to a plain answer, never to searching the web and
  // citing unrelated sources as the origin of COS's own reasoning (2026-08-23: an introspection
  // question was answered from E-Verify and FAFSA pages).
  for (const query of [
    'show me where did you get the answert from?',
    'where did you get this answer?',
    'show me your sources',
    'which rules shaped your previous answer?',
  ]) {
    assert.equal(requiresFreshExternalEvidence(query), false, query)
  }
})

test('the introspection exclusion does not disable genuine lookups about verification topics', () => {
  for (const query of [
    'what are the E-Verify requirements for employers?',
    'where can I find answers about visas?',
    'who is the current president of France?',
  ]) {
    assert.equal(requiresFreshExternalEvidence(query), true, query)
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


test('regulated public guidance is live-verified across supported languages', () => {
  for (const prompt of [
    'What documents should I change after changing my surname in Poland?',
    'I changed my surname. What should I do and which offices must I notify?',
    'zmieniłam nazwisko, co powinnam zrobić - jakie dokumenty zmienić, jakie instytucje powiadomić?',
    'Quais documentos devo alterar depois de mudar meu sobrenome?',
    '¿Qué documentos debo cambiar después de cambiar mi apellido?',
    'Какие документы нужно изменить после смены фамилии?',
  ]) {
    assert.equal(requiresFreshExternalEvidence(prompt), true, prompt)
  }
})
