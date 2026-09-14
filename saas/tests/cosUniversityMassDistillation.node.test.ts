import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildMassDistillationBatches,
  classifyMassDistillationRights,
  MASS_DISTILLATION_MAX_BATCH,
  MASS_DISTILLATION_MIN_BATCH,
  retainedIdentityEligibleForMassDistillation,
} from '../lib/ai/cos/cosUniversityMassDistillation.ts'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const h = (n: number) => n.toString(16).padStart(64, '0')

test('mass distillation admits only conservative training-rights classes', () => {
  assert.equal(classifyMassDistillationRights('Public Domain'), 'public_domain')
  assert.equal(classifyMassDistillationRights('OpenAlex CC0 abstract read for grounded learning; COS retains only facts, summary, and provenance'), 'cc0')
  assert.equal(classifyMassDistillationRights('synthetic-benchmark-fixture'), 'itmounts_synthetic')
  assert.equal(classifyMassDistillationRights('CC BY-SA 4.0'), null)
  assert.equal(classifyMassDistillationRights('YouTube caption track fetched in full for COS learning; source URL retained'), null)
})

test('mass distillation requires confidence, identity and explicit rights', () => {
  assert.equal(retainedIdentityEligibleForMassDistillation({ contentHash: h(1), subject: 'Machine Learning', sourceKind: 'scientific_journal', license: 'public domain', confidence: 0.91 }), true)
  assert.equal(retainedIdentityEligibleForMassDistillation({ contentHash: h(2), subject: 'Machine Learning', sourceKind: 'scientific_journal', license: 'public domain', confidence: 0.79 }), false)
  assert.equal(retainedIdentityEligibleForMassDistillation({ contentHash: h(3), subject: 'Machine Learning', sourceKind: 'video_transcript', license: 'YouTube caption track fetched in full for COS learning; source URL retained', confidence: 0.99 }), false)
})

test('mass distillation batches are bounded, deterministic and do not reuse assigned hashes', () => {
  const rows = Array.from({ length: MASS_DISTILLATION_MAX_BATCH + 25 }, (_, index) => ({
    contentHash: h(index + 1), subject: 'Reasoning & Decision Science', sourceKind: 'scientific_journal',
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

test('curriculum queue stores identities only and cannot authorize spend', () => {
  const migration = source('../supabase/migrations/20260914035000_cos_university_mass_distillation_curriculum.sql')
  assert.match(migration, /create table if not exists public\.cos_university_distillation_curriculum_batches/)
  assert.match(migration, /source_hashes text\[\]/)
  assert.doesNotMatch(migration, /source_text|prompt text|response text|hidden_reasoning/)
  assert.match(migration, /dispatch_authorized boolean not null default false check \(dispatch_authorized is false\)/)
  assert.match(migration, /authority_expanded boolean not null default false check \(authority_expanded is false\)/)
  assert.match(migration, /revoke all on table public\.cos_university_distillation_curriculum_batches from public, anon, authenticated/)
})

test('frequent University learning lane packages distillation without provider dispatch', () => {
  const route = source('../app/api/cron/cos-university-learning/route.ts')
  const packager = source('../lib/ai/cos/cosUniversityMassDistillation.ts')
  assert.match(route, /prepareUniversityMassDistillationCurriculum/)
  assert.match(route, /externalCostUsd: 0/)
  assert.match(packager, /dispatch_authorized: false/)
  assert.match(packager, /externalCostUsd: 0/)
  assert.doesNotMatch(packager, /submitHuggingFaceJob|dispatchUniversityApprovedTraining|fetch\(['"]https:\/\//)
})
