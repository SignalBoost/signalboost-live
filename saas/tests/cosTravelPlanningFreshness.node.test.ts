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


test('travel source ranking prefers destination-local, user-language, and English sources over unrelated languages', () => {
  const groups = [[
    {
      title: 'Collegamenti da e per l’aeroporto di Amsterdam, come arrivare in centro',
      url: 'https://aeroporto.net/amsterdam',
      snippet: 'Informazioni su trasporto, biglietti e collegamenti con il centro.',
    },
    {
      title: 'Transport w Amsterdamie',
      url: 'https://amsterdam.info.pl/transport',
      snippet: 'Lotnisko, pociąg, bilety i transport publiczny w Amsterdamie.',
    },
    {
      title: 'Reizen met GVB',
      url: 'https://www.gvb.nl/reizen',
      snippet: 'Openbaar vervoer, tram en metro in Amsterdam.',
    },
    {
      title: 'Visit Amsterdam museums',
      url: 'https://www.iamsterdam.nl/en/see-and-do/museums-and-galleries',
      snippet: 'Official visitor information about museums, attractions and tickets.',
    },
    {
      title: 'Rijksmuseum visitor information',
      url: 'https://www.rijksmuseum.nl/en/visit',
      snippet: 'Museum tickets, opening hours and visitor information.',
    },
  ]]

  const sources = prepareFreshEvidenceAcrossQueries(groups as any, 4, polishAmsterdam)
  const urls = sources.map(source => source.url)

  assert.equal(urls[0], 'https://www.gvb.nl/reizen')
  assert.ok(urls.includes('https://amsterdam.info.pl/transport'))
  assert.ok(urls.some(url => url.includes('iamsterdam.nl') || url.includes('rijksmuseum.nl')))
  assert.ok(!urls.includes('https://aeroporto.net/amsterdam'))
})

test('travel source ranking may use an unrelated language only when preferred-language/local evidence cannot cover a requested dimension', () => {
  const groups = [[
    {
      title: 'Amsterdam airport train',
      url: 'https://example.com/amsterdam-airport-train',
      snippet: 'Airport train and public transport tickets to the city centre.',
    },
    {
      title: 'Musei ad Amsterdam',
      url: 'https://example.it/amsterdam-musei',
      snippet: 'Museo, biglietti, orari e attrazioni ad Amsterdam.',
    },
  ]]

  const sources = prepareFreshEvidenceAcrossQueries(groups as any, 4, polishAmsterdam)
  assert.ok(sources.some(source => source.url === 'https://example.it/amsterdam-musei'))
  assert.equal(freshEvidenceMeetsAuthority(polishAmsterdam, sources), true)
})
