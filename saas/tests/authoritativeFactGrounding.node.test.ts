import assert from 'node:assert/strict'
import test from 'node:test'
import {
  VOLATILE_FACT_CATEGORIES,
  classifyAuthoritativeVolatileFact,
  groundAuthoritativeVolatileFact,
} from '../lib/ai/cos/authoritativeFactGrounding.ts'
import { requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'
import {
  FRESH_SEARCH_RESULT_BUDGET,
  FRESH_SELECTED_EVIDENCE_BUDGET,
  freshEvidenceMeetsAuthority,
  freshEvidenceSearchQuery,
  prepareFreshEvidence,
  resolveDeterministicFreshOfficeHolder,
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

test('authority policy ranks government evidence dynamically without preselecting a URL', () => {
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
  assert.equal(freshEvidenceMeetsAuthority('Who is currently the president of the United States?', prepared), true)
})

test('public office-holder evidence requires government authority and an independent second host', () => {
  const oneGovernmentHost = prepareFreshEvidence([
    {
      title: 'Official office holder page',
      url: 'https://agency.gov/leadership',
      snippet: 'Official current leadership information.',
    },
  ])
  assert.equal(freshEvidenceMeetsAuthority('Who is currently the president of the United States?', oneGovernmentHost), false)

  const noGovernment = prepareFreshEvidence([
    { title: 'News report', url: 'https://example.com/news', snippet: 'A report naming an office holder.' },
    { title: 'Second report', url: 'https://example.org/news', snippet: 'Another report naming an office holder.' },
  ])
  assert.equal(freshEvidenceMeetsAuthority('Who is currently the president of the United States?', noGovernment), false)
})

test('deterministic resolver answers a simple current office-holder fact when independent live sources agree', () => {
  const prepared = prepareFreshEvidence([
    {
      title: 'President Ada Lovelace | Official leadership',
      url: 'https://agency.gov/leadership',
      snippet: 'The president of Example Republic is Ada Lovelace.',
    },
    {
      title: 'Ada Lovelace is the current president',
      url: 'https://independent.example/news',
      snippet: 'Ada Lovelace is the current president of Example Republic.',
    },
    {
      title: 'Background profile',
      url: 'https://third.example/profile',
      snippet: 'Historical background only.',
    },
  ], FRESH_SELECTED_EVIDENCE_BUDGET)

  const resolved = resolveDeterministicFreshOfficeHolder(
    'Who is currently the president of Example Republic?',
    prepared,
  )
  assert.ok(resolved)
  assert.equal(resolved?.name, 'Ada Lovelace')
  assert.equal(resolved?.confidence, 0.99)
  assert.equal(resolved?.sources.length, 2)
  assert.match(resolved?.reply || '', /Ada Lovelace/)
  assert.match(resolved?.reply || '', /\[LIVE1\]/)
  assert.equal(FRESH_SEARCH_RESULT_BUDGET, 6)
  assert.equal(FRESH_SELECTED_EVIDENCE_BUDGET, 4)
})

test('deterministic resolver refuses conflicting office-holder evidence instead of guessing', () => {
  const prepared = prepareFreshEvidence([
    {
      title: 'President Ada Lovelace | Official leadership',
      url: 'https://agency.gov/leadership',
      snippet: 'The president of Example Republic is Ada Lovelace.',
    },
    {
      title: 'Ada Lovelace is the current president',
      url: 'https://one.example/news',
      snippet: 'Ada Lovelace is the current president of Example Republic.',
    },
    {
      title: 'President Grace Hopper',
      url: 'https://other.gov/leadership',
      snippet: 'The president of Example Republic is Grace Hopper.',
    },
    {
      title: 'Grace Hopper is the current president',
      url: 'https://two.example/news',
      snippet: 'Grace Hopper is the current president of Example Republic.',
    },
  ], FRESH_SELECTED_EVIDENCE_BUDGET)

  const resolved = resolveDeterministicFreshOfficeHolder(
    'Who is currently the president of Example Republic?',
    prepared,
  )
  assert.equal(resolved, null)
})
