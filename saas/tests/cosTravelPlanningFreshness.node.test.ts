import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { requiresFreshExternalEvidence, requiresLiveTravelPlanningEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'

const polishAmsterdam = 'Mam 9 godzin do zabicia w Amsterdamie w sobot 17 października. Ląduję na Shiphal. Nie chcę wydawać za dużo pieniędzy. Przygotuj mi ekonomiczny plan zwiedzania między 9 a 18. Podaj środki transportu. Jeśli jest jakaś atrakcja płatna, której nie warto pomijać, to proszę uwzględnij ją'

test('mutable travel itineraries require live evidence even when phrased as content generation', () => {
  assert.equal(requiresLiveTravelPlanningEvidence(polishAmsterdam), true)
  assert.equal(requiresFreshExternalEvidence(polishAmsterdam), true)
  assert.equal(requiresFreshExternalEvidence('Plan a cheap Amsterdam itinerary with airport transport, museum ticket prices and opening hours.'), true)
  assert.equal(requiresFreshExternalEvidence('Write a fictional story about a traveler in Amsterdam.'), false)
})


test('semantic intent cannot downgrade mutable travel planning to self-contained authoring', () => {
  const semantic = readFileSync(new URL('../lib/ai/cos/cosSemanticTaskIntent.ts', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
  assert.match(semantic, /if \(requiresLiveTravelPlanningEvidence\(input\)\)/)
  assert.match(semantic, /mode: 'external_fact_verification'/)
  assert.match(semantic, /externalFactsRequired: true/)
  assert.match(route, /requiresFreshEvidence=baselineRequiresFreshEvidence&&!semanticIntentSuppressesFreshness\(semanticTaskIntent\)/)
})

test('completion rescue remains unavailable for fresh travel requests', () => {
  const route = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
  assert.match(route, /if\(!requestedAction&&!requiresFreshEvidence&&!hasAttachments&&!isCosCodingObjective\(input\)\)/)
})
