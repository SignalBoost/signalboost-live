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

test('fresh facts use one bounded no-cache live search', () => {
  assert.match(route, /getExternalInfo\(query, FRESH_SEARCH_RESULT_BUDGET, \{ bypassCache: true \}\)/)
  assert.match(route, /prepareFreshEvidence\(live\.results, FRESH_SELECTED_EVIDENCE_BUDGET\)/)
})

test('fresh pipeline resolves deterministically before local and external synthesis', () => {
  const deterministic = position('resolveDeterministicFreshOfficeHolder(input, sources)')
  const local = position('synthesizeFreshEvidenceLocally({ input, sources, retrievedAt, language })')
  const external = position('synthesizeFreshEvidenceExternally({ input, sources, retrievedAt, language })')
  assert.ok(deterministic < local)
  assert.ok(local < external)
})

test('fresh requests never re-enter the base COS route', () => {
  assert.match(route, /if \(!input \|\| !requiresFreshExternalEvidence\(input\)\) return basePost/)
  assert.doesNotMatch(route, /tryCOSFirstAnswer/)
  assert.doesNotMatch(route, /legacyConciergePost/)
})

test('insufficient authority fails closed without cloud escalation', () => {
  assert.match(route, /insufficient_authoritative_evidence_no_cloud_escalation/)
  assert.match(route, /externalNecessary: false/)
})

test('fresh provenance records evidence budget and external necessity', () => {
  assert.match(route, /provenance\.evidence_budget/)
  assert.match(route, /necessary: args\.externalNecessary/)
})
