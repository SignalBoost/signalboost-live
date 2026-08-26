// saas/tests/publicCorpusEvidence.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  PUBLIC_CORPUS_SOURCE_KINDS,
  isPublicCorpusSourceKind,
  filterPublicCorpusRows,
  publicCorpusFunnel,
} from '../lib/ai/cos/publicCorpusEvidence.ts'

test('externally published source kinds are admitted', () => {
  for (const kind of [
    'approved_public_web',
    'news_article',
    'official_documentation',
    'scientific_journal',
    'video_transcript',
  ]) {
    assert.equal(isPublicCorpusSourceKind(kind), true, kind)
  }
})

test('internally derived source kinds are refused', () => {
  // These live in the same table as the public research material.
  for (const kind of [
    'user_feedback',
    'verified_objective_outcome',
    'external_teacher',
    'benchmark_fixture',
    'owner_directed',
    'directed_study',
  ]) {
    assert.equal(isPublicCorpusSourceKind(kind), false, kind)
  }
})

test('an unknown or missing source kind is treated as private', () => {
  // Fail-safe: a source kind added later must be private until deliberately made public.
  for (const kind of ['', '   ', 'something_new_next_month', null, undefined, 42, {}]) {
    assert.equal(isPublicCorpusSourceKind(kind as never), false, JSON.stringify(kind))
  }
})

test('filtering keeps only public rows and drops the rest', () => {
  const rows = [
    { source_kind: 'scientific_journal', summary: 'a' },
    { source_kind: 'user_feedback', summary: 'b' },
    { source_kind: 'approved_public_web', summary: 'c' },
    { source_kind: 'external_teacher', summary: 'd' },
    { summary: 'e' },
  ]
  assert.deepEqual(filterPublicCorpusRows(rows).map(r => r.summary), ['a', 'c'])
})

test('the funnel reports what was excluded', () => {
  const rows = [
    { source_kind: 'news_article' },
    { source_kind: 'user_feedback' },
    { source_kind: 'external_teacher' },
  ]
  assert.deepEqual(publicCorpusFunnel(rows), { retrieved: 3, publicEligible: 1, excludedPrivate: 2 })
})

test('junk input is safe', () => {
  assert.deepEqual(filterPublicCorpusRows([]), [])
  assert.deepEqual(filterPublicCorpusRows(null as never), [])
  assert.deepEqual(publicCorpusFunnel([]), { retrieved: 0, publicEligible: 0, excludedPrivate: 0 })
})

test('the allowlist stays narrow and deliberate', () => {
  assert.equal(PUBLIC_CORPUS_SOURCE_KINDS.length, 5)
})

// ---------------------------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------------------------

const PUBLIC = readFileSync('lib/ai/cos/cosFirstAnswer.ts', 'utf8')

test('the public path filters before anything reaches a prompt', () => {
  assert.match(PUBLIC, /filterPublicCorpusRows\(rows\)/)
  const filterAt = PUBLIC.indexOf('filterPublicCorpusRows(rows)')
  const promptAt = PUBLIC.indexOf('PUBLIC REFERENCE EVIDENCE')
  assert.ok(filterAt > 0 && promptAt > 0)
  assert.ok(filterAt < promptAt, 'rows must be filtered before they can be injected')
})

test('retrieved evidence is actually used, not merely fetched', () => {
  assert.match(PUBLIC, /PUBLIC REFERENCE EVIDENCE \(externally published material only\)/)
})

test('the boundary instruction distinguishes public from non-public corpus material', () => {
  assert.match(PUBLIC, /non-public learned corpus items/)
  assert.match(PUBLIC, /Never mention that evidence was supplied, retrieved or selected/)
})

test('retrieval failure cannot cost the visitor an answer', () => {
  const at = PUBLIC.indexOf('let publicEvidenceBlock')
  const block = PUBLIC.slice(at, at + 2200)
  assert.match(block, /try \{/)
  assert.match(block, /catch \(error\)/)
  assert.match(block, /PUBLIC_CORPUS_RETRIEVAL_BUDGET_MS/)
})

test('the public path still touches no private store', () => {
  const at = PUBLIC.indexOf('async function tryPublicStatelessAnswer')
  const body = PUBLIC.slice(at, PUBLIC.indexOf('async function tryFreshCurrentFact'))
  for (const forbidden of [/enterpriseMemory/i, /knowledgeGraph/i, /userMemory/i, /queryNearestFacts/]) {
    assert.ok(!forbidden.test(body), `public path must not touch ${forbidden}`)
  }
})
