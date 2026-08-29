import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bodyWithFreshEvidence,
  freshEvidenceMeetsAuthority,
  freshEvidenceSearchQuery,
  freshEvidenceSearchQueries,
  prepareFreshEvidence,
  prepareFreshEvidenceAcrossQueries,
  replyCitesFreshEvidence,
  replyCitesIndependentFreshEvidence,
  resolveDeterministicDirectFlight,
  resolveDeterministicFreshOfficeHolder,
} from '../lib/ai/cos/cosFreshGrounding.ts'

test('government sources are preferred and accepted for current government office holders', () => {
  const sources = prepareFreshEvidence([
    { title: 'News result', url: 'https://example.com/current-president', snippet: 'A current answer.' },
    { title: 'Official White House', url: 'https://www.whitehouse.gov/administration/', snippet: 'Donald J. Trump is the 47th President of the United States.' },
  ])

  assert.equal(sources[0]?.url, 'https://www.whitehouse.gov/administration/')
  assert.equal(freshEvidenceMeetsAuthority('Who is the current President of the United States?', sources), true)
  assert.equal(freshEvidenceMeetsAuthority('Who is the current President of the United States?', [sources[0]]), true)
})

test('accepted public office-holder answer must cite the authoritative government source plus an independent host', () => {
  const sources = prepareFreshEvidence([
    { title: 'Official government page', url: 'https://example.gov/leader', snippet: 'The current President is Example Person.' },
    { title: 'Independent current profile', url: 'https://news.example/current-leader', snippet: 'Example Person is the current President.' },
    { title: 'Second independent profile', url: 'https://reference.example/current-leader', snippet: 'Example Person serves as President.' },
  ])
  const input = 'Who is currently the President of Exampleland?'

  const nonGovernmentOnly = `Example Person. [LIVE2] (${sources[1].url}) and [LIVE3] (${sources[2].url})`
  assert.equal(replyCitesIndependentFreshEvidence(nonGovernmentOnly, input, sources), false)

  const authoritative = `Example Person. [LIVE1] (${sources[0].url}) and [LIVE2] (${sources[1].url})`
  assert.equal(replyCitesIndependentFreshEvidence(authoritative, input, sources), true)

  const primaryGovernmentOnly = `Example Person. [LIVE1] (${sources[0].url})`
  assert.equal(replyCitesIndependentFreshEvidence(primaryGovernmentOnly, input, sources), true)
})

test('provider source date is preserved separately from retrieval time and shown to the synthesizer', () => {
  const sources = prepareFreshEvidence([
    {
      title: 'Dated report',
      url: 'https://example.com/report',
      snippet: 'A statement from an older report.',
      sourceDate: '2025-01-20T12:00:00.000Z',
    },
  ])
  assert.equal(sources[0]?.sourceDate, '2025-01-20T12:00:00.000Z')

  const body = bodyWithFreshEvidence(
    { messages: [{ role: 'user', content: 'What is the current status?' }] },
    'What is the current status?',
    sources,
    '2026-08-16T02:15:00.000Z',
  )
  const content = String(body.messages[0].content)
  assert.match(content, /Retrieved at: 2026-08-16T02:15:00\.000Z/)
  assert.match(content, /SOURCE DATE: 2025-01-20T12:00:00\.000Z/)
  assert.match(content, /A page retrieved moments ago may itself be old/)
})

test('non-government volatile facts still require live evidence but not a government domain', () => {
  const sources = prepareFreshEvidence([
    { title: 'Official company release', url: 'https://example.com/releases/current', snippet: 'Version 4.2 is current.' },
  ])
  assert.equal(freshEvidenceMeetsAuthority('What is the current software version?', sources), true)
  assert.equal(freshEvidenceMeetsAuthority('What is the current software version?', []), false)
})

test('grounded body carries live evidence and synthesis must cite both evidence id and source URL', () => {
  const sources = prepareFreshEvidence([
    { title: 'Official White House', url: 'https://www.whitehouse.gov/administration/', snippet: 'Donald J. Trump is the 47th President of the United States.' },
  ])
  const body = bodyWithFreshEvidence({ messages: [{ role: 'user', content: 'Who is the current President?' }] }, 'Who is the current President?', sources, '2026-08-15T13:30:00.000Z')
  const content = String(body.messages[0].content)

  assert.match(content, /CURRENT-FACT LIVE EVIDENCE/)
  assert.match(content, /\[LIVE1\]/)
  assert.equal(replyCitesFreshEvidence('Donald Trump. [LIVE1] https://www.whitehouse.gov/administration/', sources), true)
  assert.equal(replyCitesFreshEvidence('Donald Trump. [LIVE1]', sources), false)
  assert.equal(replyCitesFreshEvidence('Donald Trump. https://www.whitehouse.gov/administration/', sources), false)
})

test('exact production flight shape is answered deterministically before model synthesis', () => {
  const sources = prepareFreshEvidence([
    {
      title: 'Flights from Paramaribo to São Paulo: PBM to GRU Flights + Flight Schedules',
      url: 'https://route.example/flights-from-pbm-to-gru',
      snippet: '3 routes with 1 stop found. At present, there are no direct flights from Paramaribo to São Paulo. However, there are several flights from PBM to GRU with a stopover.',
      sourceDate: '2026-08-27',
    },
    {
      title: 'Flights from Paramaribo to Sao Paulo',
      url: 'https://airline.example/flights/paramaribo-sao-paulo',
      snippet: 'Find fares and schedules between Paramaribo and Sao Paulo.',
    },
    {
      title: 'Cheap flights from Paramaribo to Sao Paulo',
      url: 'https://booking.example/pbm-sao',
      snippet: 'Compare available itineraries and prices.',
    },
  ])

  const direct = resolveDeterministicDirectFlight('are there direct flights from Paramaribo to Sao Paulo?', sources)
  assert.ok(direct)
  assert.equal(direct?.kind, 'direct_flight')
  assert.equal(direct?.direct, false)
  assert.equal(direct?.confidence, 0.96)
  assert.equal(direct?.sources.length, 1)
  assert.match(direct?.reply || '', /No\. Current live route evidence indicates there are no direct\/nonstop flights/i)
  assert.match(direct?.reply || '', /\[LIVE1\]/)
  assert.match(direct?.reply || '', /https:\/\/route\.example\/flights-from-pbm-to-gru/)

  // cosFirstAnswer already calls this compatibility hook before invoking any model.
  const throughExistingHook = resolveDeterministicFreshOfficeHolder('are there direct flights from Paramaribo to Sao Paulo?', sources)
  assert.equal(throughExistingHook?.kind, 'direct_flight')
  assert.equal(throughExistingHook?.direct, false)
})

test('explicit affirmative direct-flight evidence is accepted and independently corroborated when available', () => {
  const sources = prepareFreshEvidence([
    {
      title: 'Route schedule',
      url: 'https://airline.example/route',
      snippet: 'We operate non-stop flights on this route every Monday and Thursday.',
    },
    {
      title: 'Airport route information',
      url: 'https://airport.example/destination',
      snippet: 'There are currently 2 direct flights each week on this route.',
    },
  ])

  const resolved = resolveDeterministicDirectFlight('Are there nonstop flights from Alpha City to Beta City?', sources)
  assert.ok(resolved)
  assert.equal(resolved?.direct, true)
  assert.equal(resolved?.confidence, 0.99)
  assert.equal(resolved?.sources.length, 2)
  assert.match(resolved?.reply || '', /^Yes\./)
})

test('conflicting explicit direct-flight evidence fails closed instead of choosing a side', () => {
  const sources = prepareFreshEvidence([
    {
      title: 'Route status',
      url: 'https://one.example/route',
      snippet: 'At present, there are no direct flights from Alpha City to Beta City.',
    },
    {
      title: 'Airline schedule',
      url: 'https://two.example/route',
      snippet: 'There are currently 2 direct flights each week on this route.',
    },
  ])

  assert.equal(resolveDeterministicDirectFlight('Are there direct flights from Alpha City to Beta City?', sources), null)
})

test('a connecting itinerary alone is never converted into a no-direct-flight claim', () => {
  const sources = prepareFreshEvidence([
    {
      title: 'Flight options',
      url: 'https://booking.example/route',
      snippet: 'Flights are available with 1 stop via Example Hub.',
    },
  ])

  assert.equal(resolveDeterministicDirectFlight('Are there direct flights from Alpha City to Beta City?', sources), null)
})


test('compound current-office request searches the current-holder clause before history wording', () => {
  const query = freshEvidenceSearchQuery(
    'who is the current US secretary of State and give me a list of the past secretary of state for the past 20 years',
    new Date('2026-08-28T00:00:00.000Z'),
  )
  assert.match(query, /current US secretary of State official authoritative current/i)
  assert.doesNotMatch(query, /past 20 years/i)
})


test('compound current-office and history requests receive separate live queries', () => {
  const queries = freshEvidenceSearchQueries(
    'who is the current US secretary of State and give me a list of the past secretary of state for the past 20 years',
    new Date('2026-08-28T00:00:00.000Z'),
  )
  assert.equal(queries.length, 2)
  assert.match(queries[0], /current US secretary of State/i)
  assert.match(queries[1], /US federal former secretary of State past 20 years official history list/i)
})


test('compound evidence selection retains a source from each query', () => {
  const sources = prepareFreshEvidenceAcrossQueries([
    [
      { title: 'current official one', url: 'https://agency.gov/current', snippet: 'Current office holder.' },
      { title: 'current official two', url: 'https://agency.gov/current-2', snippet: 'Current office holder.' },
      { title: 'current official three', url: 'https://agency.gov/current-3', snippet: 'Current office holder.' },
    ],
    [
      { title: 'official history', url: 'https://history.gov/former', snippet: 'Former office holders.' },
    ],
  ], 4)
  assert.equal(sources.length, 3)
  assert.ok(sources.some(source => source.url === 'https://history.gov/former'))
})


test('compound current-office request can deterministically preserve a government-grounded incumbent', () => {
  const sources = prepareFreshEvidence([
    { title: 'The Secretary of State', url: 'https://www.state.gov/secretary/', snippet: 'Marco Rubio is the current Secretary of State of the United States.' },
    { title: 'List of United States secretaries of state', url: 'https://reference.example/list', snippet: 'Historical office-holder list.' },
  ])
  const resolved = resolveDeterministicFreshOfficeHolder(
    'who is the current US secretary of State and give me a list of the past secretary of state for the past 20 years',
    sources,
  )
  assert.ok(resolved)
  assert.equal(resolved?.name, 'Marco Rubio')
  assert.match(resolved?.reply || '', /state\.gov\/secretary/)
})
