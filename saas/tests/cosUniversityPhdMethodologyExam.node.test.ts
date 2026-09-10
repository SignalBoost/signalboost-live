import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  COS_UNIVERSITY_PHD_METHODOLOGY_EXAMINER_ACTOR_ID,
  buildCosUniversityPhdMethodologyExam,
  scoreCosUniversityPhdMethodologyExam,
} from '../lib/ai/cos/cosUniversityPhdMethodologyExam.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

test('PhD methodology exam is seeded, reproducible, bounded, and methodology-focused', () => {
  const first = buildCosUniversityPhdMethodologyExam('seed-a', 'ai_systems_research')
  const again = buildCosUniversityPhdMethodologyExam('seed-a', 'ai_systems_research')
  const other = buildCosUniversityPhdMethodologyExam('seed-b', 'ai_systems_research')
  assert.equal(first.manifestHash, again.manifestHash)
  assert.notEqual(first.manifestHash, other.manifestHash)
  assert.match(first.prompt, /UNSEEN PHD RESEARCH METHODOLOGY EXAM/)
  assert.match(first.prompt, /Do not invent observations/)
  assert.deepEqual(first.rubric.requiredHeadings, ['Claim', 'Design', 'Threats', 'Test', 'Reproducibility'])
  assert.ok(first.rubric.maxWords <= 500)
})

test('host scorer requires fresh local provenance plus causal, validity, test, and reproducibility reasoning', () => {
  const exam = buildCosUniversityPhdMethodologyExam('seed-score', 'security_trust_research')
  const reply = [
    'Claim: The observational association does not prove a causal effect; uncertainty remains.',
    'Design: Use a randomized comparison or justified control baseline with a falsifiable hypothesis and explicit prediction.',
    'Threats: Address confounding, selection bias, measurement drift, and instrument validity.',
    'Test: Preregister the hypothesis, operationalize each measure, specify the instrument, and define falsification criteria.',
    'Reproducibility: Publish reproducible procedures and artifacts, then require independent replication before generalizing.',
  ].join('\n')
  const pass = scoreCosUniversityPhdMethodologyExam(exam, reply, {
    localReasoning: true,
    externalAi: false,
    semanticCache: false,
    handled: true,
    turnId: 'turn-1',
  })
  assert.equal(pass.passed, true, pass.reasons.join(','))

  const cached = scoreCosUniversityPhdMethodologyExam(exam, reply, {
    localReasoning: true,
    externalAi: false,
    semanticCache: true,
    handled: true,
    turnId: 'turn-2',
  })
  assert.equal(cached.passed, false)
  assert.ok(cached.reasons.includes('semantic_cache_used'))
})

test('examiner is a distinct host-controlled principal and candidate output cannot self-record academic evidence', () => {
  const runner = file('lib/ai/cos/cosUniversityPhdMethodologyExamRunner.ts')
  assert.equal(COS_UNIVERSITY_PHD_METHODOLOGY_EXAMINER_ACTOR_ID, 'host-phd-methodology-examiner-v1')
  assert.match(runner, /actorRole: 'methodology_examiner'/)
  assert.match(runner, /principalType: 'system'/)
  assert.match(runner, /recordHostCosUniversityPhdEvidence\(/)
  assert.match(runner, /evaluatorActorIds: \[row\.evaluator_actor_id\]/)
  assert.match(runner, /performerActorIds: \[row\.candidate_actor_id\]/)
  assert.match(runner, /authority: 'host_private_exam'/)
  assert.match(runner, /independent: true/)
  assert.doesNotMatch(file('app/api/admin/cos-university-phd/route.ts'), /recordHostCosUniversityPhdEvidence/)
})

test('methodology evidence is bound to the enrolled candidate model actually used for the exam turn', () => {
  const runner = file('lib/ai/cos/cosUniversityPhdMethodologyExamRunner.ts')
  assert.match(runner, /result\.provenance\.reasonerLabel/)
  assert.match(runner, /candidate\.actorRole === 'candidate'/)
  assert.match(runner, /candidate\.principalType === 'ai_model'/)
  assert.match(runner, /cosUniversityPhdActorIdentityEligible\(candidate, completedAt\)/)
  assert.match(runner, /candidate\.principalFingerprint === reasonerFingerprint/)
  assert.match(runner, /candidate_reasoner_principal_mismatch/)
  assert.match(runner, /fresh_candidate_execution_required/)
})

test('methodology attempts continue only to the existing A+ evidence target and respect failure resets', () => {
  const runner = file('lib/ai/cos/cosUniversityPhdMethodologyExamRunner.ts')
  assert.match(runner, /cosUniversityPhdDistinctPassesAfterLatestFailure\(/)
  assert.match(runner, /program\.aPlusDistinctPasses\.research_methodology_exam/)
  assert.match(runner, /stage: 'research_methodology_exam'/)
  assert.match(runner, /variantHash: row\.variant_hash/)
})

test('exam run storage is service-only and stores no raw prompt, rubric, reply, or degree state', () => {
  const schema = file('supabase/migrations/20260910012000_cos_university_phd_methodology_exam_runs.sql')
  assert.match(schema, /alter table public\.cos_university_phd_methodology_exam_runs enable row level security/i)
  assert.match(schema, /revoke all on table public\.cos_university_phd_methodology_exam_runs from anon, authenticated, service_role/i)
  assert.match(schema, /grant select, insert, update on table public\.cos_university_phd_methodology_exam_runs to service_role/i)
  assert.match(schema, /evidence_recorded boolean not null default false/)
  assert.match(schema, /fresh_execution boolean not null default false/)
  assert.doesNotMatch(schema, /raw_prompt|prompt text|rubric json|reply text|graduated boolean|degree/i)
})

test('PhD methodology cron is independently gated and cannot bypass the research boundary', () => {
  const route = file('app/api/cron/cos-university-phd-methodology-exam/route.ts')
  const vercel = JSON.parse(file('vercel.json')) as {
    env: Record<string, string>
    crons: Array<{ path: string; schedule: string }>
  }
  assert.match(route, /CRON_SECRET/)
  assert.match(route, /COS_UNIVERSITY_PHD_METHODOLOGY_EXAMS_ENABLED !== 'true'/)
  assert.equal(vercel.env.COS_UNIVERSITY_PHD_METHODOLOGY_EXAMS_ENABLED, 'true')
  assert.deepEqual(vercel.crons.find(row => row.path === '/api/cron/cos-university-phd-methodology-exam'), {
    path: '/api/cron/cos-university-phd-methodology-exam', schedule: '11 * * * *',
  })
  assert.match(file('lib/ai/cos/cosUniversityPhdResearchPolicy.ts'), /independent_methodology_exam_required/)
})
