import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bodyWithFreshEvidence,
  freshEvidenceMeetsAuthority,
  prepareFreshEvidence,
  replyCitesFreshEvidence,
  replyCitesIndependentFreshEvidence,
} from '../lib/ai/cos/cosFreshGrounding.ts'

test('government sources are preferred and required for current government office holders', () => {
  const sources = prepareFreshEvidence([
    { title: 'News result', url: 'https://example.com/current-president', snippet: 'A current answer.' },
    { title: 'Official White House', url: 'https://www.whitehouse.gov/administration/', snippet: 'Donald J. Trump is the 47th President of the United States.' },
  ])

  assert.equal(sources[0]?.url, 'https://www.whitehouse.gov/administration/')
  assert.equal(freshEvidenceMeetsAuthority('Who is the current President of the United States?', sources), true)
  assert.equal(freshEvidenceMeetsAuthority('Who is the current President of the United States?', [sources[1]]), false)
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
})

test('life-status claims require two independent live hosts and citations', () => {
  const sources = prepareFreshEvidence([
    { title: 'Official statement', url: 'https://official.example/person', snippet: 'The person died on a stated date.' },
    { title: 'Independent report', url: 'https://news.example/person', snippet: 'The report independently confirms the death.' },
  ])
  const input = 'when Hulk Hogan died?'

  assert.equal(freshEvidenceMeetsAuthority(input, [sources[0]]), false)
  assert.equal(freshEvidenceMeetsAuthority(input, sources), true)
  assert.equal(replyCitesIndependentFreshEvidence(`[LIVE1] ${sources[0].url}`, input, sources), false)
  assert.equal(replyCitesIndependentFreshEvidence(`[LIVE1] ${sources[0].url} [LIVE2] ${sources[1].url}`, input, sources), true)
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
