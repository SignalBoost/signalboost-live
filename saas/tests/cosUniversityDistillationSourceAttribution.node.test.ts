// saas/tests/cosUniversityDistillationSourceAttribution.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { attributeDistillationSources, classifyDistillationSource, DISTILLATION_SOURCE_ATTRIBUTION_CLAIM } from '../lib/ai/cos/cosUniversityDistillationSourceAttribution.ts'
import { teacherSyntheticSourceHash } from '../lib/ai/cos/cosUniversityHybridDistillation.ts'

const real = (n: number) => `a${n}`.padEnd(64, '0')

test('teacher-synthetic sources are recognized by the planner hash, and real material stays real', () => {
  const subjectId = 'computer_science'
  assert.equal(classifyDistillationSource({ subjectId, sourceHash: teacherSyntheticSourceHash(subjectId, 3) }), 'teacher_synthetic')
  assert.equal(classifyDistillationSource({ subjectId, sourceHash: real(1) }), 'real_source')
  // A synthetic hash belongs to its own subject only; the same hash under another subject is not credited synthetic.
  assert.equal(classifyDistillationSource({ subjectId: 'mathematics', sourceHash: teacherSyntheticSourceHash(subjectId, 3) }), 'real_source')
  assert.equal(classifyDistillationSource({ subjectId, sourceHash: 'not-a-hash' }), null)
})

test('a declared failure-derived origin is honoured, and an unknown label never is', () => {
  const subjectId = 'computer_science'
  assert.equal(classifyDistillationSource({ subjectId, sourceHash: real(2), declaredOrigins: { [real(2)]: 'failure_derived' } }), 'failure_derived')
  assert.equal(classifyDistillationSource({ subjectId, sourceHash: real(2), declaredOrigins: { [real(2)]: 'invented_origin' } }), 'real_source')
})

test('the mix is counted and reported as percentages that add up', () => {
  const subjectId = 'computer_science'
  const attribution = attributeDistillationSources({
    subjectId,
    sourceHashes: [real(1), real(2), real(3), teacherSyntheticSourceHash(subjectId, 0), 'junk'],
    declaredOrigins: { [real(3)]: 'failure_derived' },
  })
  assert.equal(attribution.total, 4)
  assert.deepEqual(attribution.counts, { real_source: 2, failure_derived: 1, teacher_synthetic: 1 })
  assert.deepEqual(attribution.percentages, { real_source: 50, failure_derived: 25, teacher_synthetic: 25 })
  assert.equal(attribution.unclassified, 1)
})

test('an empty batch reports zeroes instead of dividing by zero', () => {
  const attribution = attributeDistillationSources({ subjectId: 'mathematics', sourceHashes: [] })
  assert.equal(attribution.total, 0)
  assert.deepEqual(attribution.percentages, { real_source: 0, failure_derived: 0, teacher_synthetic: 0 })
})

test('registration records the mix as descriptive evidence and can never fail a completed training run', () => {
  const consumer = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistillationConsumer.ts', import.meta.url), 'utf8')
  const upsertAt = consumer.indexOf("db.from('cos_local_distillation_artifacts').upsert(")
  const attributionAt = consumer.indexOf('attributeDistillationSources({')
  assert.ok(upsertAt > 0 && attributionAt > upsertAt)
  assert.match(consumer, /claim: DISTILLATION_SOURCE_ATTRIBUTION_CLAIM/)
  assert.match(consumer, /try \{[\s\S]*attributeDistillationSources\([\s\S]*\} catch \(error\) \{/)
  assert.match(consumer, /sourceMix: attribution, trafficAuthorized: false/)
  assert.equal(DISTILLATION_SOURCE_ATTRIBUTION_CLAIM, 'distillation_source_attribution_recorded')
})
