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

// One COS pipeline (2026-09-26): public questions are reasoned by the enterprise pipeline in the
// public audience. The public boundary is enforced in its retrieval, before any row reaches a prompt.
const PIPELINE = readFileSync('lib/ai/cos/cosFirstAnswerEnterprise.ts', 'utf8')
const RETRIEVAL = PIPELINE.slice(
  PIPELINE.indexOf('async function retrieveInternalContext('),
  PIPELINE.indexOf('function executionFunnel('),
)

test('the public audience filters learned rows before anything reaches a prompt', () => {
  assert.match(RETRIEVAL, /const publicAudience = audience === 'public'/)
  assert.match(RETRIEVAL, /publicAudience \? filterPublicCorpusRows\(semanticLearnedAll\) : semanticLearnedAll/)
  assert.match(RETRIEVAL, /const rows = publicAudience \? filterPublicCorpusRows\(unfilteredRows\) : unfilteredRows/)
  const filterAt = PIPELINE.indexOf('filterPublicCorpusRows(semanticLearnedAll)')
  const promptAt = PIPELINE.indexOf('CURRENT USER INPUT (QUESTION, STATEMENT, OR PASTED TEXT)')
  assert.ok(filterAt > 0 && promptAt > filterAt, 'rows must be filtered before they can be injected')
})

test('the boundary instruction distinguishes public from non-public corpus material', () => {
  assert.match(PIPELINE, /non-public learned corpus items/)
  assert.match(PIPELINE, /Never mention that evidence was supplied, retrieved or selected/)
})

test('retrieval failure cannot cost the visitor an answer', () => {
  const at = PIPELINE.indexOf('async function semanticLearnedCorpus(')
  const block = PIPELINE.slice(at, at + 1800)
  assert.match(block, /\.catch\(error =>/)
  assert.match(block, /return null/)
})

test('the public audience touches no private store', () => {
  assert.match(RETRIEVAL, /publicAudience \? Promise\.resolve\(\[\] as Awaited<ReturnType<typeof semanticKnowledgeFacts>>\) : semanticKnowledgeFacts\(prompt, db\)/)
  assert.match(RETRIEVAL, /if \(publicAudience\) \{\n\s*\/\/ Knowledge Graph facts are internal company records/)
  assert.match(RETRIEVAL, /const scopeResolution = publicAudience\n\s*\? \{ scope:null, status:'not_available_public_delivery' as const \}/)
  assert.match(RETRIEVAL, /if \(userId && !publicAudience\) \{/)
})
