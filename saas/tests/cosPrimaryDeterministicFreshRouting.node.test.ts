import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')

test('cos-primary resolves explicit direct-flight evidence before any local model synthesis', () => {
  const authorityGate = source.indexOf('if(!authoritySatisfied)')
  const deterministicResolver = source.indexOf('resolveDeterministicDirectFlight(lookupInput,freshSources)')
  const localSynthesis = source.indexOf('const localSynthesis=await synthesizeFreshEvidenceLocally')

  assert.ok(authorityGate >= 0, 'fresh authority gate must exist')
  assert.ok(deterministicResolver > authorityGate, 'deterministic resolver must run only after live authority succeeds')
  assert.ok(localSynthesis > deterministicResolver, 'deterministic direct-flight resolution must run before Qwen synthesis')
  assert.match(source, /fresh_deterministic_resolution_accepted/)
  assert.match(source, /source:'cos-fresh-deterministic-grounded'/)
  assert.match(source, /local_model_invoked:false/)
})


test('cos-primary executes every planned query, reads selected public list pages, and allocates evidence across a compound request', () => {
  assert.match(source, /freshEvidenceSearchQueries\(lookupInput\)/)
  assert.match(source, /Promise\.all\(queries\.map\(query=>getExternalInfo\(query,8/)
  assert.match(source, /prepareFreshEvidenceAcrossQueries\(liveResults\.filter/)
  assert.match(source, /Promise\.allSettled\(listSources\.map\(source => readPublicPages\(\[source\.url\]\)\)\)/)
  assert.match(source, /result\.status === 'fulfilled' \? result\.value : \[\]/)
})


test('cos-primary returns a verified clause as a partial result when compound synthesis is rejected', () => {
  assert.match(source, /resolveDeterministicFreshOfficeHolder\(lookupInput,freshSources\)/)
  assert.match(source, /partialFreshOfficeHolderReply/)
  assert.match(source, /cos-fresh-partial-grounded/)
  assert.match(source, /partial_completion:partialCompletion/)
  assert.match(source, /status:partialCompletion\|\|freshFailureCode!=='local_synthesis_failed'\?200:503/)
})


test('compound history extraction ranks roster pages ahead of generic office pages', () => {
  assert.match(source, /priority\s*=\s*\(source: FreshEvidenceSource\).*former\|history\|list/s)
  assert.match(source, /\.sort\(\(left, right\)/)
  assert.match(source, /\.slice\(0, 3\)/)
})


test('completed evidence-policy refusals are HTTP 200 while transport synthesis failures remain 503', () => {
  assert.match(source, /freshFailureCode!=='local_synthesis_failed'\?200:503/)
  assert.match(source, /source:'cos-fresh-evidence-unavailable'[\s\S]{0,800}?status:200/)
})
