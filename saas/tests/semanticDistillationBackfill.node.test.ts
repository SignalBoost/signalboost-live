import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  distillSemanticKnowledge,
  semanticDistillText,
  SEMANTIC_DISTILLATION_VERSION,
} from '../lib/cos-core/layers/learning/semanticDistillation.ts'
import { planLearnedCorpusSemanticDistillation } from '../lib/ai/cos/learnedCorpusSemantic.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

test('semantic deduplication never collapses contradictory polarity', () => {
  const result = semanticDistillText([
    'Tenant access is allowed after verification.',
    'Tenant access is not allowed after verification.',
  ].join(' '), 'tenant access verification', { maxUnits: 4 })

  assert.match(result.text, /access is allowed after verification/i)
  assert.match(result.text, /access is not allowed after verification/i)
  assert.equal(result.retainedUnits, 2)
})

test('semantic deduplication preserves conditional and numeric qualifiers', () => {
  const result = semanticDistillText([
    'Standard records require retention for 14 days.',
    'Standard records require retention for 30 days if legal hold applies.',
  ].join(' '), 'standard records retention', { maxUnits: 4 })

  assert.match(result.text, /14 days/i)
  assert.match(result.text, /30 days if legal hold applies/i)
  assert.equal(result.retainedUnits, 2)
})

test('fact distillation retains conflicting claims instead of treating them as duplicates', () => {
  const distilled = distillSemanticKnowledge({
    subject: 'tenant access verification',
    summary: 'Tenant access policy is evaluated from authoritative evidence.',
    facts: [
      { predicate: 'access_policy', object: 'Tenant access is allowed after verification.', confidence: 0.9 },
      { predicate: 'access_policy', object: 'Tenant access is not allowed after verification.', confidence: 0.91 },
    ],
  })

  assert.equal(distilled.facts.length, 2)
})

test('historical corpus plan is deterministic and idempotent', () => {
  const first = planLearnedCorpusSemanticDistillation({
    subject: 'zero trust security',
    summary: 'Zero trust requires every request to be verified. Zero trust requires verification of every request. However, emergency access must not bypass audit logging.',
    facts: [
      { predicate: 'source_excerpt', object: 'Every request must be verified before access.', confidence: 0.8 },
      { predicate: 'source_excerpt', object: 'Every request must be verified before access.', confidence: 0.9 },
      { predicate: 'audit_exception', object: 'Emergency access must not bypass audit logging.', confidence: 0.88 },
    ],
  })

  assert.equal(first.changed, true)
  assert.equal(Array.isArray(first.facts) ? first.facts.length : -1, 2)
  assert.match(first.summary, /must not bypass audit logging/i)

  const second = planLearnedCorpusSemanticDistillation({
    subject: 'zero trust security',
    summary: first.summary,
    facts: first.facts,
  })
  assert.equal(second.changed, false)
  assert.equal(second.summary, first.summary)
  assert.deepEqual(second.facts, first.facts)
})

test('historical backfill invalidates vectors only when semantic fields change and never writes provenance', () => {
  const semanticCorpus = file('lib/ai/cos/learnedCorpusSemantic.ts')
  const backfillStart = semanticCorpus.indexOf('export async function backfillRetainedCorpusSemanticDistillation')
  const backfillEnd = semanticCorpus.indexOf('const CORPUS_SELECT', backfillStart)
  const backfill = semanticCorpus.slice(backfillStart, backfillEnd)

  assert.ok(backfillStart >= 0 && backfillEnd > backfillStart)
  assert.match(backfill, /if \(plan\.changed\)/)
  assert.match(backfill, /payload\.summary = plan\.summary/)
  assert.match(backfill, /payload\.facts = plan\.facts/)
  assert.match(backfill, /payload\.embedding = null/)
  assert.match(backfill, /payload\.embedding_model = null/)
  assert.match(backfill, /semantic_distillation_version: SEMANTIC_DISTILLATION_VERSION/)
  assert.doesNotMatch(backfill, /payload\.(evidence|source_uri|source_title|observed_at|content_hash)\s*=/)
})

test('learned corpus indexing advances semantic backfill before selecting embeddings', () => {
  const indexing = file('lib/ai/cos/learnedCorpusIndexing.ts')
  const distill = indexing.indexOf('await backfillRetainedCorpusSemanticDistillation')
  const select = indexing.indexOf('await pendingRows', distill)
  assert.ok(distill >= 0)
  assert.ok(select > distill)
})

test('semantic backfill migration is durable and explicitly provenance-safe', () => {
  const migration = file('supabase/migrations/20260911202000_cos_learning_semantic_distillation_backfill.sql')
  assert.match(migration, /semantic_distillation_version text/i)
  assert.match(migration, /semantic_distilled_at timestamptz/i)
  assert.match(migration, /raw evidence\/provenance remain untouched/i)
  assert.equal(SEMANTIC_DISTILLATION_VERSION, 'semantic_v2_20260911')
})
