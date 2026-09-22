import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { requiresLiveTravelPlanningEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'
import { freshEvidenceMeetsAuthority, freshEvidenceSearchQueries, prepareFreshEvidenceAcrossQueries } from '../lib/ai/cos/cosFreshGrounding.ts'

const polishAmsterdam = 'Mam 9 godzin do zabicia w Amsterdamie w sobot 17 października. Ląduję na Shiphal. Nie chcę wydawać za dużo pieniędzy. Przygotuj mi ekonomiczny plan zwiedzania między 9 a 18. Podaj środki transportu. Jeśli jest jakaś atrakcja płatna, której nie warto pomijać, to proszę uwzględnij ją'

test('travel planning remains detectable without forcing the strict fresh-fact verifier', () => {
  assert.equal(requiresLiveTravelPlanningEvidence(polishAmsterdam), true)
  const policy = readFileSync(new URL('../lib/ai/cos/cosFreshnessPolicy.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(policy, /if \(requiresLiveTravelPlanningEvidence\(input\)\) return true/)
})


test('semantic intent may classify travel naturally instead of a deterministic freshness override', () => {
  const semantic = readFileSync(new URL('../lib/ai/cos/cosSemanticTaskIntent.ts', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(semantic, /if \(requiresLiveTravelPlanningEvidence\(input\)\)/)
  assert.match(route, /requiresFreshEvidence=baselineRequiresFreshEvidence&&!semanticIntentSuppressesFreshness\(semanticTaskIntent\)/)
})

test('completion rescue remains unavailable for fresh travel requests', () => {
  const route = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
  assert.match(route, /if\(!requestedAction&&!requiresFreshEvidence&&!hasAttachments&&!isCosCodingObjective\(input\)\)/)
})


test('travel research plan asks separately for official transport and attraction facts', () => {
  const queries = freshEvidenceSearchQueries(polishAmsterdam, new Date('2026-09-21T00:00:00.000Z'))
  assert.ok(queries.length >= 4)
  const joined = queries.join('\n')
  assert.match(joined, /official airport city transport train bus metro fares schedules/i)
  assert.match(joined, /official city public transport day pass fares tickets/i)
  assert.match(joined, /official tourism museums attractions ticket prices opening hours reservations/i)
})

test('travel evidence preparation discards irrelevant live-search hits and keeps both requested dimensions', () => {
  const groups = [
    [
      { title: 'Current time in Amsterdam', url: 'https://time.example/amsterdam', snippet: 'Local time zone and clock.' },
      { title: 'Critical rhetorical methods', url: 'https://university.example/research-methods', snippet: 'Academic research methodology.' },
    ],
    [
      { title: 'Airport public transport', url: 'https://airport.example/public-transport', snippet: 'Train and bus connections, fares, station and tickets.' },
      { title: 'Airport train', url: 'https://rail.example/airport', snippet: 'Train schedules between the airport and city centre.' },
    ],
    [
      { title: 'City visitor transport', url: 'https://visit.example/transport', snippet: 'Public transport day pass, metro, tram and fares.' },
    ],
    [
      { title: 'Official museums and attractions', url: 'https://tourism.example/museums', snippet: 'Museum tickets, attraction admission, opening hours and reservations.' },
      { title: 'Old city news', url: 'https://news.example/city', snippet: 'Archived news and headlines.' },
    ],
  ]

  const sources = prepareFreshEvidenceAcrossQueries(groups as any, 8, polishAmsterdam)
  const urls = sources.map(source => source.url)
  assert.ok(!urls.includes('https://time.example/amsterdam'))
  assert.ok(!urls.includes('https://university.example/research-methods'))
  assert.ok(urls.some(url => /airport|rail|transport/.test(url)))
  assert.ok(urls.some(url => /museums/.test(url)))
  assert.equal(freshEvidenceMeetsAuthority(polishAmsterdam, sources), true)
})

test('travel authority gate refuses one-dimensional evidence for a request that asks for both transport and attractions', () => {
  const transportOnly = prepareFreshEvidenceAcrossQueries([[
    { title: 'Airport public transport', url: 'https://airport.example/public-transport', snippet: 'Train, bus, fares and tickets.' },
    { title: 'Rail planner', url: 'https://rail.example/airport', snippet: 'Train schedules and station information.' },
  ]] as any, 8, polishAmsterdam)
  assert.equal(freshEvidenceMeetsAuthority(polishAmsterdam, transportOnly), false)
})
