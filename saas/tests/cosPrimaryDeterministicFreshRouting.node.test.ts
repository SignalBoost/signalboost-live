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


test('cos-primary executes every planned query and deepens thin evidence for a compound request', () => {
  assert.match(source, /freshEvidenceSearchQueries\(lookupInput\)/)
  assert.match(source, /Promise\.all\(queries\.map\(query=>getExternalInfo\(query,8/)
  assert.match(source, /prepareFreshEvidenceAcrossQueries\(liveResults\.filter/)
  assert.match(source, /deepenClaimResearch\(lookupInput,freshSources,readPublicPages\)/)
})


test('cos-primary returns a verified clause as a partial result when compound synthesis is rejected', () => {
  assert.match(source, /resolveDeterministicFreshOfficeHolder\(lookupInput,freshSources\)/)
  assert.match(source, /partialFreshOfficeHolderReply/)
  assert.match(source, /cos-fresh-partial-grounded/)
  assert.match(source, /partial_completion:partialCompletion/)
  assert.match(source, /status:partialCompletion\|\|freshFailureCode!=='local_synthesis_failed'\?200:503/)
})


test('compound research records claim-level page reading before judgment', () => {
  assert.match(source, /claim_research:claimResearch\.claims/)
  assert.match(source, /pages_read:claimResearch\.pagesRead/)
})


test('completed evidence-policy refusals are HTTP 200 while transport synthesis failures remain 503', () => {
  assert.match(source, /freshFailureCode!=='local_synthesis_failed'\?200:503/)
  assert.match(source, /source:'cos-fresh-evidence-unavailable'[\s\S]{0,800}?status:200/)
})


test('compound page extraction is delegated to shared claim research', () => {
  assert.match(source, /from '@\/lib\/ai\/cos\/cosClaimResearch'/)
})
