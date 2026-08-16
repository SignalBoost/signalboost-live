import assert from 'node:assert/strict'
import test from 'node:test'
import {
  VOLATILE_FACT_CATEGORIES,
  classifyAuthoritativeVolatileFact,
  groundAuthoritativeVolatileFact,
} from '../lib/ai/cos/authoritativeFactGrounding.ts'
import { requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'
import {
  freshEvidenceMeetsAuthority,
  freshEvidenceSearchQuery,
  prepareFreshEvidence,
} from '../lib/ai/cos/cosFreshGrounding.ts'

test('current office-holder questions use generic freshness policy, not a fixed fact registry', () => {
  assert.equal(requiresFreshExternalEvidence('Who is currently the president of the United States?'), true)
  assert.equal(requiresFreshExternalEvidence('Who is the current prime minister of Canada?'), true)
  assert.equal(requiresFreshExternalEvidence('Who is the CEO of Example Corp now?'), true)
  assert.equal(VOLATILE_FACT_CATEGORIES.length, 0)
  assert.equal(classifyAuthoritativeVolatileFact('Who is currently the president of the United States?'), null)
})

test('retired fixed-source grounder performs no network request', async () => {
  let calls = 0
  const grounded = await groundAuthoritativeVolatileFact('Who is currently the president of the United States?', {
    fetch: async () => {
      calls += 1
      return { ok: true, status: 200, text: async () => '<main>should never be read</main>' }
    },
  })
  assert.equal(grounded, null)
  assert.equal(calls, 0)
})

test('fresh-evidence search query is source-agnostic and current-date scoped', () => {
  const query = freshEvidenceSearchQuery(
    'Who is currently the president of the United States?',
    new Date('2026-08-15T12:00:00.000Z'),
  )
  assert.match(query, /official authoritative independent verification/i)
  assert.match(query, /2026-08-15/)
  assert.doesNotMatch(query, /usa\.gov/i)
  assert.doesNotMatch(query, /whitehouse\.gov/i)
})

test('authority policy dynamically promotes government evidence without preselecting a URL', () => {
  const prepared = prepareFreshEvidence([
    {
      title: 'Commentary about the office holder',
      url: 'https://example.com/commentary',
      snippet: 'Secondary commentary.',
    },
    {
      title: 'Official office holder page',
      url: 'https://agency.gov/leadership',
      snippet: 'Official current leadership information.',
    },
  ])

  assert.equal(prepared[0].url, 'https://agency.gov/leadership')
  assert.equal(
    freshEvidenceMeetsAuthority('Who is currently the president of the United States?', prepared),
    true,
  )
})

test('office-holder evidence fails closed when live search has no government authority', () => {
  const prepared = prepareFreshEvidence([
    {
      title: 'News report',
      url: 'https://example.com/news',
      snippet: 'A report naming an office holder.',
    },
  ])
  assert.equal(
    freshEvidenceMeetsAuthority('Who is currently the president of the United States?', prepared),
    false,
  )
})
