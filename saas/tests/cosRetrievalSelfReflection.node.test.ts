import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  assessRetrievalReflectionPredictiveValue,
  deriveRetrievalSelfReflection,
  RETRIEVAL_REFLECTION_MIN_VERIFIED_OUTCOMES,
} from '../lib/ai/cos/retrievalSelfReflection.ts'

function items(values: Array<[string, number, boolean]>) {
  return values.map(([sourceKind, similarity, cited]) => ({ sourceKind, similarity, cited }))
}

test('zero-citation low-quality retrieval is a bounded risk hypothesis, not a live policy change', () => {
  const reflection = deriveRetrievalSelfReflection({
    injected: 3,
    cited: 0,
    items: items([['reference', .61, false], ['news', .64, false], ['official_docs', .66, false]]),
  })
  assert.equal(reflection.sufficiency, 'weak')
  assert.equal(reflection.missingEvidenceClass, 'retrieval_quality')
  assert.equal(reflection.recommendation, 'raise_similarity_floor')
  assert.ok(reflection.predictedFailureRisk >= .7)
})

test('single-source unused retrieval recommends diversity without hard-coding a topic', () => {
  const reflection = deriveRetrievalSelfReflection({
    injected: 4,
    cited: 0,
    items: items([['reference', .82, false], ['reference', .80, false], ['reference', .79, false], ['reference', .77, false]]),
  })
  assert.equal(reflection.missingEvidenceClass, 'source_diversity')
  assert.equal(reflection.recommendation, 'diversify_sources')
})

test('high unused context with clearly stronger cited items proposes a higher similarity floor', () => {
  const reflection = deriveRetrievalSelfReflection({
    injected: 5,
    cited: 1,
    items: items([['reference', .92, true], ['reference', .69, false], ['news', .67, false], ['official_docs', .64, false], ['reference', .61, false]]),
  })
  assert.equal(reflection.sufficiency, 'over_supplied')
  assert.equal(reflection.recommendation, 'raise_similarity_floor')
  assert.ok((reflection.signals.similaritySeparation || 0) >= .05)
  assert.ok(reflection.predictedFailureRisk < .5)
})

test('utilized evidence produces no-change rather than inventing a retrieval problem', () => {
  const reflection = deriveRetrievalSelfReflection({
    injected: 3,
    cited: 2,
    items: items([['official_docs', .86, true], ['reference', .82, true], ['news', .74, false]]),
  })
  assert.equal(reflection.sufficiency, 'adequate')
  assert.equal(reflection.missingEvidenceClass, 'none')
  assert.equal(reflection.recommendation, 'no_change')
  assert.ok(reflection.predictedFailureRisk < .5)
})

test('predictive gate deduplicates repeated turns and cannot pass on a success-only cohort', () => {
  const repeated = Array.from({ length: RETRIEVAL_REFLECTION_MIN_VERIFIED_OUTCOMES + 5 }, (_, index) => ({
    turnId: index < 8 ? 'same-turn' : `success-${index}`,
    predictedFailureRisk: .1,
    verifiedSuccess: true,
  }))
  const assessment = assessRetrievalReflectionPredictiveValue(repeated)
  assert.equal(assessment.shadowValidationEligible, false)
  assert.ok(assessment.verifiedOutcomes < RETRIEVAL_REFLECTION_MIN_VERIFIED_OUTCOMES)
  assert.match(assessment.reasons.join(' '), /successes and failures/i)
})

test('well-separated diverse verified outcomes can only unlock a separate shadow validation', () => {
  const rows = [
    ...Array.from({ length: 6 }, (_, index) => ({ turnId: `success-${index}`, predictedFailureRisk: .10, verifiedSuccess: true })),
    ...Array.from({ length: 6 }, (_, index) => ({ turnId: `failure-${index}`, predictedFailureRisk: .82, verifiedSuccess: false })),
  ]
  const assessment = assessRetrievalReflectionPredictiveValue(rows)
  assert.equal(assessment.verifiedOutcomes, 12)
  assert.equal(assessment.shadowValidationEligible, true)
  assert.ok((assessment.riskSeparation || 0) >= .15)
  assert.ok((assessment.brierScore || 1) <= .22)
  assert.match(assessment.reasons[0], /separate shadow-policy validation/i)
})

test('weak predictions remain blocked even with enough verified outcomes', () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    turnId: `turn-${index}`,
    predictedFailureRisk: .45,
    verifiedSuccess: index % 2 === 0,
  }))
  const assessment = assessRetrievalReflectionPredictiveValue(rows)
  assert.equal(assessment.shadowValidationEligible, false)
  assert.ok(assessment.reasons.some(reason => /accuracy|Brier|separation/i.test(reason)))
})

test('production persistence creates reflection only after source-use persistence and adds no model call', () => {
  const source = readFileSync(new URL('../lib/ai/cos/evidenceSourceUseStore.ts', import.meta.url), 'utf8')
  const sourceUseWrite = source.indexOf("from('cos_evidence_source_use').upsert")
  const reflectionWrite = source.indexOf('await persistRetrievalSelfReflection')
  assert.ok(sourceUseWrite >= 0)
  assert.ok(reflectionWrite > sourceUseWrite)
  assert.doesNotMatch(source, /callCosReasoner|callRawCosReasoner|openai|anthropic/i)
})

test('reflection schema is prompt-free, RLS protected, and correlates outcomes in either arrival order', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20260822_cos_retrieval_self_reflection.sql', import.meta.url), 'utf8')
  assert.match(migration, /enable row level security/i)
  assert.match(migration, /revoke all on table public\.cos_retrieval_reflections from anon, authenticated/i)
  assert.match(migration, /before insert or update of predicted_failure_risk/i)
  assert.match(migration, /after insert or update of verified_success, repair_needed, outcome_source, outcome_at/i)
  assert.doesNotMatch(migration, /\bprompt\s+(?:text|jsonb)|\banswer\s+(?:text|jsonb)|chain_of_thought/i)
})

test('owner report is read-only and explicitly says live retrieval is unchanged', () => {
  const route = readFileSync(new URL('../app/api/admin/cos-retrieval-self-reflection/route.ts', import.meta.url), 'utf8')
  const store = readFileSync(new URL('../lib/ai/cos/retrievalSelfReflectionStore.ts', import.meta.url), 'utf8')
  assert.match(route, /requireOwner\(\)/)
  assert.match(route, /export async function GET/)
  assert.doesNotMatch(route, /export async function POST|export async function PUT|export async function DELETE/)
  assert.match(store, /livePolicyChanged:\s*false/)
  assert.match(store, /separate controlled shadow-policy validation/i)
})
