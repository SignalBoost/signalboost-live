import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const route = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')

function position(token: string): number {
  const index = route.indexOf(token)
  assert.ok(index >= 0, `expected route to contain ${token}`)
  return index
}

test('fresh facts use one bounded no-cache live search before synthesis', () => {
  const liveSearch = position('getExternalInfo(query, FRESH_SEARCH_RESULT_BUDGET, { bypassCache: true })')
  const authority = position('freshEvidenceMeetsAuthority(input, sources)')
  const synthesis = position('synthesizeFreshEvidenceExternally({ input, sources, retrievedAt, language })')
  assert.ok(liveSearch < authority)
  assert.ok(authority < synthesis)
  assert.match(route, /prepareFreshEvidence\(live\.results, FRESH_SELECTED_EVIDENCE_BUDGET\)/)
})

test('fresh requests are classified at ingress and never fall back to the ordinary model-memory route', () => {
  assert.match(route, /requiresFreshExternalEvidence\(input\)/)
  assert.match(route, /if \(!input \|\| !requiresFreshExternalEvidence\(input\)\) return basePost/)
  assert.match(route, /local_model_invoked:\s*false/)
  assert.doesNotMatch(route, /tryCOSFirstAnswer/)
})

test('insufficient live authority fails closed before any synthesis model is invoked', () => {
  const authorityFailure = position('if (!authoritySatisfied)')
  const synthesis = position('synthesizeFreshEvidenceExternally({ input, sources, retrievedAt, language })')
  assert.ok(authorityFailure < synthesis)
  assert.match(route, /insufficient_authoritative_evidence_no_model_synthesis/)
  assert.match(route, /No model-memory answer was used/)
})

test('fresh synthesis receives only server-retrieved evidence and records grounded provenance', () => {
  assert.match(route, /freshEvidenceSearchQuery\(input/)
  assert.match(route, /fresh_live_data_grounded_external_policy/)
  assert.match(route, /grounded_at:\s*retrievedAt/)
  assert.match(route, /live_evidence_retrieved_this_turn:\s*true/)
})

test('fresh pipeline never silently degrades to cached evidence', () => {
  assert.match(route, /bypassCache:\s*true/)
  assert.doesNotMatch(route, /bypassCache:\s*false/)
})
