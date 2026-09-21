import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { requiresFreshExternalEvidence, requiresLiveTravelPlanningEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'
import { freshEvidenceSearchQueries } from '../lib/ai/cos/cosFreshGrounding.ts'

const polishAmsterdam = 'Mam 9 godzin do zabicia w Amsterdamie w sobot 17 października. Ląduję na Shiphal. Nie chcę wydawać za dużo pieniędzy. Przygotuj mi ekonomiczny plan zwiedzania między 9 a 18. Podaj środki transportu. Jeśli jest jakaś atrakcja płatna, której nie warto pomijać, to proszę uwzględnij ją'

test('mutable travel itineraries require live evidence even when phrased as content generation', () => {
  assert.equal(requiresLiveTravelPlanningEvidence(polishAmsterdam), true)
  assert.equal(requiresFreshExternalEvidence(polishAmsterdam), true)
  assert.equal(requiresFreshExternalEvidence('Plan a cheap Amsterdam itinerary with airport transport, museum ticket prices and opening hours.'), true)
  assert.equal(requiresFreshExternalEvidence('Write a fictional story about a traveler in Amsterdam.'), false)
})

test('travel planning retrieves separate transport and attraction evidence sets', () => {
  const queries = freshEvidenceSearchQueries(polishAmsterdam, new Date('2026-09-21T00:00:00.000Z'))
  assert.ok(queries.length >= 3)
  const joined = queries.join('\n')
  assert.match(joined, /airport city transport train bus fares schedules/i)
  assert.match(joined, /attractions museums ticket prices opening hours reservations/i)
})

test('semantic content-generation intent cannot suppress hard travel freshness', () => {
  const route = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
  const core = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerCore.ts', import.meta.url), 'utf8')
  assert.match(route, /const hardTravelFreshness=requiresLiveTravelPlanningEvidence\(input\)/)
  assert.match(route, /if\(!hardTravelFreshness&&!hasAttachments/)
  assert.match(route, /baselineRequiresFreshEvidence&&\(hardTravelFreshness\|\|!semanticIntentSuppressesFreshness/)
  assert.match(core, /const hardTravelFreshness = requiresLiveTravelPlanningEvidence\(input\.prompt\)/)
  assert.match(core, /const suppressFreshnessForInterpretation = !hardTravelFreshness && semanticIntentSuppressesFreshness/)
})

test('completion rescue remains unavailable for hard fresh travel requests', () => {
  const route = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
  assert.match(route, /if\(!requestedAction&&!requiresFreshEvidence&&!hasAttachments&&!isCosCodingObjective\(input\)\)/)
})
