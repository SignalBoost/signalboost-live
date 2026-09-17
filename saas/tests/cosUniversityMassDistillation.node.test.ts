// saas/tests/cosUniversityMassDistillation.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildMassDistillationBatches,
  analyzeMassDistillationSupply,
  classifyMassDistillationRights,
  MASS_DISTILLATION_MAX_BATCH,
  MASS_DISTILLATION_MIN_BATCH,
  retainedIdentityEligibleForMassDistillation,
  retainedMaterialHash,
} from '../lib/ai/cos/cosUniversityMassDistillation.ts'
import { buildMassDistillationReplenishmentGaps } from '../lib/ai/cos/cosUniversityDistillationCurriculumPlan.ts'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const h = (n: number) => n.toString(16).padStart(64, '0')

test('mass distillation admits only conservative training-rights classes', () => {
  assert.equal(classifyMassDistillationRights('Public Domain'), 'public_domain')
  assert.equal(classifyMassDistillationRights('OpenAlex CC0 abstract read for grounded learning; COS retains only facts, summary, and provenance'), 'cc0')
  assert.equal(classifyMassDistillationRights('synthetic-benchmark-fixture'), 'itmounts_synthetic')
  assert.equal(classifyMassDistillationRights('CC BY-SA 4.0'), null)
  assert.equal(classifyMassDistillationRights('YouTube caption track fetched in full for COS learning; source URL retained'), null)
})

test('retained material fingerprint normalizes teaching content rather than row identity', () => {
  const first = retainedMaterialHash({
    sourceTitle: ' Binary Search ',
    summary: 'Search a sorted array by repeatedly halving the interval.',
    facts: ['O(log n)', 'Requires sorted input'],
  })
  const same = retainedMaterialHash({
    sourceTitle: 'binary   search',
    summary: ' search a sorted array by repeatedly halving the interval. ',
    facts: ['Requires sorted input', 'O(log n)'],
  })
  const different = retainedMaterialHash({
    sourceTitle: 'Binary Search',
    summary: 'A different retained explanation of interpolation search.',
    facts: ['Distribution-sensitive'],
  })
  assert.match(first || '', /^[a-f0-9]{64}$/)
  assert.equal(same, first)
  assert.notEqual(different, first)
  assert.equal(retainedMaterialHash({ sourceTitle: '', summary: '', facts: [] }), null)
})

test('mass distillation requires confidence, row identity, material identity and explicit rights', () => {
  assert.equal(retainedIdentityEligibleForMassDistillation({ contentHash: h(1), materialHash: h(101), subject: 'Machine Learning', sourceKind: 'scientific_journal', license: 'public domain', confidence: 0.91 }), true)
  assert.equal(retainedIdentityEligibleForMassDistillation({ contentHash: h(2), materialHash: h(102), subject: 'Machine Learning', sourceKind: 'scientific_journal', license: 'public domain', confidence: 0.79 }), false)
  assert.equal(retainedIdentityEligibleForMassDistillation({ contentHash: h(3), materialHash: h(103), subject: 'Machine Learning', sourceKind: 'video_transcript', license: 'YouTube caption track fetched in full for COS learning; source URL retained', confidence: 0.99 }), false)
  assert.equal(retainedIdentityEligibleForMassDistillation({ contentHash: h(4), materialHash: '', subject: 'Machine Learning', sourceKind: 'scientific_journal', license: 'public domain', confidence: 0.99 }), false)
})

test('mass distillation batches are bounded, deterministic and do not reuse assigned hashes', () => {
  const rows = Array.from({ length: MASS_DISTILLATION_MAX_BATCH + 25 }, (_, index) => ({
    contentHash: h(index + 1), materialHash: h(index + 10_000), subject: 'Reasoning & Decision Science', sourceKind: 'scientific_journal',
    license: index % 2 ? 'Public Domain' : 'OpenAlex CC0 abstract read for grounded learning', confidence: 0.9,
  }))
  const first = buildMassDistillationBatches(rows)
  assert.equal(first.length, 2)
  assert.equal(first[0].sourceCount, MASS_DISTILLATION_MAX_BATCH)
  assert.equal(first[1].sourceCount, 25)
  assert.deepEqual(buildMassDistillationBatches(rows), first)
  const assigned = new Set(first[0].sourceHashes)
  const remaining = buildMassDistillationBatches(rows, assigned)
  assert.equal(remaining.length, 1)
  assert.equal(remaining[0].sourceCount, 25)
  assert.ok(remaining[0].sourceCount >= MASS_DISTILLATION_MIN_BATCH)
})

test('subject aliases package through the canonical University subject family without lowering the minimum', () => {
  const rows = [
    ...Array.from({ length: 10 }, (_, index) => ({
      contentHash: h(index + 30_000), materialHash: h(index + 40_000), subject: 'TypeScript and Next.js',
      sourceKind: 'course_material', license: 'Public Domain', confidence: 0.95,
    })),
    ...Array.from({ length: 10 }, (_, index) => ({
      contentHash: h(index + 31_000), materialHash: h(index + 41_000), subject: 'databases',
      sourceKind: 'course_material', license: 'Public Domain', confidence: 0.95,
    })),
  ]
  const prepared = buildMassDistillationBatches(rows)
  assert.equal(prepared.length, 1)
  assert.equal(prepared[0].sourceCount, MASS_DISTILLATION_MIN_BATCH)
  assert.equal(prepared[0].subjectId, 'Computer Science & Coding')
})

test('AI engineering labels join Computer Science distillation without lowering the minimum', () => {
  const rows = [
    ...Array.from({ length: 19 }, (_, index) => ({
      contentHash: h(index + 50_000), materialHash: h(index + 60_000), subject: 'Retrieval-Augmented Generation (RAG)',
      sourceKind: 'course_material', license: 'Public Domain', confidence: 0.95,
    })),
    {
      contentHash: h(50_100), materialHash: h(60_100), subject: 'AI Agents, RAG, Embeddings, Architectures, Framework, VectorDB & Memory',
      sourceKind: 'course_material', license: 'Public Domain', confidence: 0.95,
    },
  ]
  const prepared = buildMassDistillationBatches(rows)
  assert.equal(prepared.length, 1)
  assert.equal(prepared[0].sourceCount, MASS_DISTILLATION_MIN_BATCH)
  assert.equal(prepared[0].subjectId, 'Computer Science & Coding')
})

test('storage hashes cannot manufacture a distillation batch from duplicate learning material', () => {
  const duplicateRows = Array.from({ length: 34 }, (_, index) => ({
    contentHash: h(index + 1), materialHash: h(999_999), subject: 'Data Structures and Algorithms in Python',
    sourceKind: 'course_material', license: 'Public Domain', confidence: 0.95,
  }))
  assert.equal(buildMassDistillationBatches(duplicateRows).length, 0)

  const uniqueRows = Array.from({ length: MASS_DISTILLATION_MIN_BATCH }, (_, index) => ({
    contentHash: h(index + 100), materialHash: h(index + 20_000), subject: 'Data Structures and Algorithms in Python',
    sourceKind: 'course_material', license: 'Public Domain', confidence: 0.95,
  }))
  const prepared = buildMassDistillationBatches([...duplicateRows, ...uniqueRows])
  assert.equal(prepared.length, 1)
  assert.equal(prepared[0].sourceCount, MASS_DISTILLATION_MIN_BATCH + 1)
  assert.equal(new Set(prepared[0].sourceHashes).size, prepared[0].sourceCount)
})

test('supply telemetry reports unique post-dedup batchable material and exact subject shortfalls', () => {
  const assigned = new Set([h(1)])
  const rows = [
    { contentHash: h(1), materialHash: h(101), subject: 'Social psychology', sourceKind: 'scientific_journal', license: 'Public Domain', confidence: 0.95 },
    { contentHash: h(2), materialHash: h(101), subject: 'Social psychology', sourceKind: 'scientific_journal', license: 'Public Domain', confidence: 0.95 },
    ...Array.from({ length: 18 }, (_, index) => ({
      contentHash: h(index + 10), materialHash: h(index + 1_000), subject: 'Social psychology',
      sourceKind: 'scientific_journal', license: 'OpenAlex CC0 abstract read for grounded learning', confidence: 0.9,
    })),
    ...Array.from({ length: 4 }, (_, index) => ({
      contentHash: h(index + 100), materialHash: h(2_000), subject: 'Public policy and diplomacy',
      sourceKind: 'scientific_journal', license: 'Public Domain', confidence: 0.9,
    })),
  ]
  const supply = analyzeMassDistillationSupply(rows, assigned)
  assert.equal(supply.rawUnassignedRows, 23)
  assert.equal(supply.uniqueBatchableItems, 19)
  assert.deepEqual(supply.subjects.map(subject => [subject.subjectKey, subject.uniqueBatchableItems, subject.shortfallToBatch]), [
    ['social_behavioral_sciences', 18, 2],
    ['politics_government_international_relations', 1, 19],
  ])
})

test('targeted replenishment prioritizes the nearest canonical batches without weakening the floor', () => {
  const supply = analyzeMassDistillationSupply([
    ...Array.from({ length: 18 }, (_, index) => ({ contentHash: h(index + 10), materialHash: h(index + 1_000), subject: 'Social psychology', sourceKind: 'scientific_journal', license: 'Public Domain', confidence: 0.9 })),
    ...Array.from({ length: 14 }, (_, index) => ({ contentHash: h(index + 100), materialHash: h(index + 2_000), subject: 'Statistics and causal inference', sourceKind: 'scientific_journal', license: 'Public Domain', confidence: 0.9 })),
  ])
  const gaps = buildMassDistillationReplenishmentGaps(supply.subjects, new Date('2026-09-16T00:00:00.000Z'))
  assert.deepEqual(gaps.map(gap => gap.subject).slice(0, 2), ['Social & Behavioral Sciences', 'Statistics & Data Science'])
  assert.equal(gaps.length, 3, 'the free slot goes to an empty canonical subject instead of idling')
  assert.ok(gaps.every(gap => gap.sourceKinds?.length === 1 && gap.sourceKinds[0] === 'scientific_journal'))
  assert.match(gaps[0].evidence.join(' '), /shortfall_to_batch=2/)
  assert.equal(MASS_DISTILLATION_MIN_BATCH, 20)
})

test('curriculum queue stores identities only and cannot authorize spend', () => {
  const migration = source('../supabase/migrations/20260914035000_cos_university_mass_distillation_curriculum.sql')
  assert.match(migration, /create table if not exists public\.cos_university_distillation_curriculum_batches/)
  assert.match(migration, /source_hashes text\[\]/)
  assert.doesNotMatch(migration, /source_text|prompt text|response text|hidden_reasoning/)
  assert.match(migration, /dispatch_authorized boolean not null default false check \(dispatch_authorized is false\)/)
  assert.match(migration, /authority_expanded boolean not null default false check \(authority_expanded is false\)/)
  assert.match(migration, /revoke all on table public\.cos_university_distillation_curriculum_batches from public, anon, authenticated/)
})

test('duplicate-material Production fence quarantines stale batches and blocks claim/rearm', () => {
  const migration = source('../supabase/migrations/20260914193100_cos_university_mass_distillation_unique_material.sql')
  assert.match(migration, /unique_material_count < 20/)
  assert.match(migration, /set status='quarantined'/)
  assert.match(migration, /where b\.batch_key=r\.batch_key and b\.status='prepared'/)
  assert.match(migration, /create or replace function public\.claim_cos_university_mass_distillation_stage/)
  assert.match(migration, /create or replace function public\.rearm_cos_university_mass_distillation_campaign/)
  assert.doesNotMatch(migration, /max_total_cost_usd\s*=|automatic_promotion_authorized\s*=\s*true|runpod_mutation_authorized\s*=\s*true/)
})

test('frequent University learning lane packages unique material without provider dispatch', () => {
  const route = source('../app/api/cron/cos-university-learning/route.ts')
  const packager = source('../lib/ai/cos/cosUniversityMassDistillation.ts')
  assert.match(route, /prepareUniversityMassDistillationCurriculum/)
  assert.match(route, /externalCostUsd: 0/)
  assert.match(packager, /source_title,summary,facts/)
  assert.match(packager, /retainedMaterialHash/)
  assert.match(packager, /classifyCosUniversitySubjects/)
  assert.match(packager, /cosUniversitySubjectById/)
  assert.match(packager, /group\.materialHashes\.has\(row\.materialHash\)/)
  assert.match(packager, /'teacher_synthesis_ready', 'consumed'/)
  assert.match(packager, /dispatch_authorized: false/)
  assert.match(packager, /externalCostUsd: 0/)
  assert.doesNotMatch(packager, /submitHuggingFaceJob|dispatchUniversityApprovedTraining|fetch\(['"]https:\/\//)
})
