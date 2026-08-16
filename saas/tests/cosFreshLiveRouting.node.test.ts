import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')
const route = () => read('../app/api/cos-primary/route.ts')
const externalInfo = () => read('../lib/ai/tools/getExternalInfo.ts')
const structuredInfo = () => read('../lib/ai/tools/getStructuredLiveInfo.ts')
const externalSynthesis = () => read('../lib/ai/cos/freshEvidenceExternalSynthesis.ts')
const synthesisContract = () => read('../lib/ai/cos/freshEvidenceSynthesisContract.ts')

test('fresh/current facts retrieve live evidence before any model synthesis', () => {
  const source = route()
  const liveSearch = source.indexOf('await getExternalInfo(')
  const synthesis = source.indexOf('await synthesizeFreshEvidenceExternally(')
  assert.ok(liveSearch >= 0, 'fresh route must perform live retrieval')
  assert.ok(synthesis > liveSearch, 'external synthesis must happen only after live retrieval')
  assert.match(source, /bypassCache:\s*true/)
  assert.match(source, /freshEvidenceMeetsAuthority\(input, sources\)/)
})

test('fresh/current facts never invoke local Qwen or deterministic model-memory shortcuts', () => {
  const source = route()
  assert.doesNotMatch(source, /freshEvidenceLocalSynthesis/)
  assert.doesNotMatch(source, /synthesizeFreshEvidenceLocally/)
  assert.doesNotMatch(source, /resolveDeterministicFreshOfficeHolder/)
  assert.doesNotMatch(source, /callLocalModel/)
  assert.match(source, /local_model_invoked:\s*false/)
  assert.match(source, /policy:\s*'fresh_live_data_external_only'/)
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

test('fresh/current evidence synthesis prefers Gemini', () => {
  const source = externalSynthesis()
  assert.match(source, /modelPreference:\s*'gemini'/)
})

test('fresh/current model memory is explicitly forbidden by the synthesis contract', () => {
  const source = synthesisContract()
  assert.match(source, /evidence block is your ONLY permitted source of facts/)
  assert.match(source, /Your own memory is assumed stale and must not contribute facts/)
  assert.match(source, /EVIDENCE_INSUFFICIENT/)
})
