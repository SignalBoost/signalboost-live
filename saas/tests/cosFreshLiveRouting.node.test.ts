import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')
const route = () => read('../app/api/cos-primary/route.ts')
const externalInfo = () => read('../lib/ai/tools/getExternalInfo.ts')
const structuredInfo = () => read('../lib/ai/tools/getStructuredLiveInfo.ts')
const externalSynthesis = () => read('../lib/ai/cos/freshEvidenceExternalSynthesis.ts')
const synthesisContract = () => read('../lib/ai/cos/freshEvidenceSynthesisContract.ts')

test('fresh/current facts retrieve live evidence before local synthesis and any hosted fallback', () => {
  const source = route()
  const liveSearch = source.indexOf('getExternalInfo(query,8,{bypassCache:true})')
  const localSynthesis = source.indexOf('await synthesizeFreshEvidenceLocally(')
  const isolationGate = source.indexOf('if(!externalFallbackEnabled())')
  const hostedFallback = source.indexOf('await synthesizeFreshEvidenceExternally(')
  assert.ok(liveSearch >= 0, 'fresh route must perform live retrieval')
  assert.ok(localSynthesis > liveSearch, 'local COS synthesis must happen only after live retrieval')
  assert.ok(isolationGate > localSynthesis, 'external-disabled mode must be checked only after local synthesis gets a chance to answer')
  assert.ok(hostedFallback > isolationGate, 'governed hosted fallback must remain after the local-first path')
  assert.match(source, /bypassCache:\s*true/)
  assert.match(source, /freshEvidenceMeetsQuestionAuthority\(lookupInput, sources\)/)
})

test('fresh follow-ups resolve user context before retrieval and local synthesis never trusts assistant text', () => {
  const source = route()
  assert.match(source, /resolveFreshConversationContext\(body, input\)/)
  assert.match(source, /freshEvidenceSearchQueries\(lookupInput/)
  assert.match(source, /assistant_text_used_for_resolution:\s*false/)
  assert.match(source, /synthesizeFreshEvidenceLocally\(\{input:lookupInput/)
  assert.match(source, /synthesizeFreshEvidenceExternally\(\{ input: lookupInput/)
})

test('contextual volatile cache key uses resolved lookup input, not ambiguous surface text', () => {
  const source = route()
  assert.match(source, /writeVolatileAnswerCache\(\{prompt:\s*lookupInput/)
  assert.doesNotMatch(source, /writeVolatileAnswerCache\(\{[\s\S]{0,120}?prompt:\s*input,/)
})

test('fresh/current facts use evidence-only local COS synthesis before external AI', () => {
  const source = route()
  assert.match(source, /freshEvidenceLocalSynthesis/)
  assert.match(source, /synthesizeFreshEvidenceLocally/)
  assert.doesNotMatch(source, /resolveDeterministicFreshOfficeHolder/)
  assert.match(source, /source:'cos-fresh-local-grounded'/)
  assert.match(source, /policy:'fresh_live_data_local_first'/)
  assert.doesNotMatch(source, /policy:\s*'fresh_live_data_external_only'/)
})

test('direct/nonstop route existence is current external state and is live-verified', () => {
  for (const prompt of [
    'are there direct flights from Paramaribo to Sao Paulo?',
    'Is there a direct flight between Tokyo and Lima?',
    'Does any airline fly nonstop from Miami to Lisbon?',
    'is there a direct train from Paris to Berlin',
    '¿hay vuelos directos entre Madrid y Bogotá?',
    'há voos diretos de Lisboa para São Paulo?',
    'czy są loty bezpośrednie z Warszawy do Nowego Jorku?',
    'есть ли прямые рейсы из Москвы в Гавану?',
  ]) {
    assert.equal(requiresFreshExternalEvidence(prompt), true, prompt)
  }
})

test('high-frequency values require structured real-time data before ordinary web search', () => {
  const source = externalInfo()
  const cleanQuery = source.indexOf('structuredProviderQuery(q)')
  const structuredClass = source.indexOf('structuredLiveDataKind(structuredQuery)')
  const structuredFetch = source.indexOf('await getStructuredLiveInfo(structuredQuery, structuredKind)')
  const ordinarySearch = source.indexOf('await getWebSearchPort().search(')
  assert.ok(cleanQuery >= 0, 'external lookup must remove authority-search suffixes before structured lookup')
  assert.ok(structuredClass > cleanQuery, 'structured live-data classification must use the clean query')
  assert.ok(structuredFetch > structuredClass, 'structured provider must be called after classification')
  assert.ok(ordinarySearch > structuredFetch, 'ordinary web search must occur only after the structured branch has returned')
  assert.match(source, /if \(structuredKind\)[\s\S]*?return \{[\s\S]*?ok: structured\.ok/)
})

test('structured real-time adapter uses Brave rich callback and compact timestamped scalar evidence', () => {
  const source = structuredInfo()
  assert.match(source, /enable_rich_callback/)
  assert.match(source, /callback_key/)
  assert.match(source, /\/res\/v1\/web\/rich/)
  assert.match(source, /sourceKind:\s*'structured_realtime'/)
  assert.match(source, /cache:\s*'no-store'/)
  assert.match(source, /STRUCTURED_REALTIME vertical=/)
  assert.match(source, /observed_at=/)
  assert.match(source, /\.slice\(0, 480\)/)
  assert.match(source, /No structured real-time callback was available/)
})

test('governed external fresh synthesis remains available only as the final provider fallback', () => {
  const source = externalSynthesis()
  const local = source.indexOf('await callCosReasoner(')
  const hosted = source.indexOf('await callCosTextDetailed(')
  assert.ok(local >= 0)
  assert.ok(hosted > local)
  assert.match(source, /modelPreference:\s*'gemini'/)
})

test('fresh/current model memory is explicitly forbidden by the synthesis contract', () => {
  const source = synthesisContract()
  assert.match(source, /evidence block is your ONLY permitted source of facts/)
  assert.match(source, /Your own memory is assumed stale and must not contribute facts/)
  assert.match(source, /EVIDENCE_INSUFFICIENT/)
})
