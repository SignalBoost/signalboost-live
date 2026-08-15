import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bodyWithFreshEvidence,
  freshEvidenceMeetsAuthority,
  prepareFreshEvidence,
  replyCitesFreshEvidence,
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

test('non-government volatile facts still require live evidence but not a government domain', () => {
  const sources = prepareFreshEvidence([
    { title: 'Official company release', url: 'https://example.com/releases/current', snippet: 'Version 4.2 is current.' },
  ])
  assert.equal(freshEvidenceMeetsAuthority('What is the current software version?', sources), true)
  assert.equal(freshEvidenceMeetsAuthority('What is the current software version?', []), false)
})

test('grounded body carries live evidence and synthesis must cite it', () => {
  const sources = prepareFreshEvidence([
    { title: 'Official White House', url: 'https://www.whitehouse.gov/administration/', snippet: 'Donald J. Trump is the 47th President of the United States.' },
  ])
  const body = bodyWithFreshEvidence({ messages: [{ role: 'user', content: 'Who is the current President?' }] }, 'Who is the current President?', sources, '2026-08-15T13:30:00.000Z')
  const content = String(body.messages[0].content)

  assert.match(content, /CURRENT-FACT LIVE EVIDENCE/)
  assert.match(content, /\[LIVE1\]/)
  assert.equal(replyCitesFreshEvidence('Donald Trump. [LIVE1]', sources), true)
  assert.equal(replyCitesFreshEvidence('Donald Trump.', sources), false)
})
