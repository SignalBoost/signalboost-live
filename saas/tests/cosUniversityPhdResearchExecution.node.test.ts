import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  cosUniversityPhdResearchWorkAcademicCredit,
  decideNextCosUniversityPhdCandidateResearch,
  type CosUniversityPhdResearchEvidenceState,
  type CosUniversityPhdResearchRunState,
} from '../lib/ai/cos/cosUniversityPhdResearchPolicy.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

function decision(
  blocker: string,
  runs: CosUniversityPhdResearchRunState[] = [],
  evidence: CosUniversityPhdResearchEvidenceState[] = [],
) {
  return decideNextCosUniversityPhdCandidateResearch({ graduationBlockers: [blocker], runs, evidence })
}

test('candidate research products can never mint academic credit', () => {
  assert.equal(cosUniversityPhdResearchWorkAcademicCredit(), false)
  const schema = file('supabase/migrations/20260908210500_cos_university_phd_research_execution.sql')
  assert.match(schema, /academic_credit boolean not null default false check \(academic_credit = false\)/)
  assert.doesNotMatch(schema, /graduated boolean/i)
  assert.doesNotMatch(schema, /standing text/i)
  assert.doesNotMatch(schema, /credential/i)
})

test('research execution uses service-only ledgers and its trigger guard is not RPC-executable', () => {
  const schema = file('supabase/migrations/20260908210500_cos_university_phd_research_execution.sql')
  for (const table of [
    'cos_university_phd_work_assignments',
    'cos_university_phd_work_runs',
    'cos_university_phd_work_products',
  ]) {
    assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
    assert.match(schema, new RegExp(`revoke all on table public\\.${table} from anon, authenticated, service_role`, 'i'))
  }
  assert.match(schema, /grant select, insert on table public\.cos_university_phd_work_assignments to service_role/i)
  assert.match(schema, /grant select, insert, update on table public\.cos_university_phd_work_runs to service_role/i)
  assert.match(schema, /grant select, insert on table public\.cos_university_phd_work_products to service_role/i)
  assert.match(schema, /before update or delete on public\.cos_university_phd_work_assignments/i)
  assert.match(schema, /before update or delete on public\.cos_university_phd_work_products/i)
  assert.match(schema, /revoke all on function public\.cos_university_phd_work_immutable_guard\(\) from anon, authenticated, service_role/i)
})

test('methodology and independent stages stop at independent boundaries', () => {
  assert.equal(decision('research_methodology_exam_incomplete').reason, 'independent_methodology_exam_required')
  assert.equal(decision('independent_replication_incomplete').reason, 'independent_replication_required')
  assert.equal(decision('peer_critique_defense_incomplete').reason, 'independent_peer_review_required')
})

test('candidate can research literature and hypotheses but submitted work waits for independent evaluation', () => {
  const literature = decision('primary_literature_synthesis_incomplete')
  assert.equal(literature.workKind, 'primary_literature_research')
  assert.equal(literature.attemptIndex, 0)

  const submitted = decision('primary_literature_synthesis_incomplete', [{
    workKind: 'primary_literature_research', attemptIndex: 0, status: 'submitted', completedAt: '2027-01-01T00:00:00Z',
  }])
  assert.equal(submitted.workKind, null)
  assert.equal(submitted.reason, 'awaiting_independent_evaluation')
  assert.equal(decision('hypothesis_proposal_incomplete').workKind, 'hypothesis_development')
})

test('a later or tied independent failure reopens candidate research with a new attempt', () => {
  const run: CosUniversityPhdResearchRunState = {
    workKind: 'hypothesis_development', attemptIndex: 0, status: 'submitted', completedAt: '2027-01-01T00:00:00Z',
  }
  const later = decision('hypothesis_proposal_incomplete', [run], [{
    stage: 'hypothesis_proposal', passed: false, observedAt: '2027-01-02T00:00:00Z',
  }])
  assert.equal(later.workKind, 'hypothesis_development')
  assert.equal(later.attemptIndex, 1)

  const tied = decision('hypothesis_proposal_incomplete', [run], [{
    stage: 'hypothesis_proposal', passed: false, observedAt: '2027-01-01T00:00:00Z',
  }])
  assert.equal(tied.workKind, 'hypothesis_development')
  assert.equal(tied.attemptIndex, 1)
})

test('global integrity blockers can never be misreported as academic research complete', () => {
  const unknown = decideNextCosUniversityPhdCandidateResearch({
    graduationBlockers: ['research_evidence_identity_collision'], runs: [], evidence: [],
  })
  assert.equal(unknown.reason, 'research_integrity_repair_required')

  const staleRepair = decideNextCosUniversityPhdCandidateResearch({
    graduationBlockers: ['research_lineage_link_failed'],
    integrityRepairStage: 'hypothesis_proposal',
    integrityRepairAllowedParentEvidenceIds: ['lit-new'],
    integrityRepairRequiresCandidateWork: true,
    runs: [{
      workKind: 'hypothesis_development', attemptIndex: 0, status: 'submitted',
      completedAt: '2027-01-01T00:00:00Z', parentEvidenceIds: ['lit-old'],
    }],
    evidence: [],
  })
  assert.equal(staleRepair.workKind, 'hypothesis_development')
  assert.equal(staleRepair.attemptIndex, 1)
  assert.equal(staleRepair.reason, 'schedule_candidate_research')

  const freshRepair = decideNextCosUniversityPhdCandidateResearch({
    graduationBlockers: ['research_lineage_link_failed'],
    integrityRepairStage: 'hypothesis_proposal',
    integrityRepairAllowedParentEvidenceIds: ['lit-new'],
    integrityRepairRequiresCandidateWork: true,
    runs: [{
      workKind: 'hypothesis_development', attemptIndex: 1, status: 'submitted',
      completedAt: '2027-01-03T00:00:00Z', parentEvidenceIds: ['lit-new'],
    }],
    evidence: [],
  })
  assert.equal(freshRepair.workKind, null)
  assert.equal(freshRepair.reason, 'awaiting_independent_evaluation')
})

test('independence repairs never send the candidate back to self-authored work', () => {
  const experiment = decideNextCosUniversityPhdCandidateResearch({
    graduationBlockers: ['research_independence_separation_failed'],
    integrityRepairStage: 'preregistered_experiment',
    integrityRepairRequiresCandidateWork: false,
    runs: [], evidence: [],
  })
  assert.equal(experiment.workKind, null)
  assert.equal(experiment.reason, 'governed_experiment_execution_required')

  const dissertation = decideNextCosUniversityPhdCandidateResearch({
    graduationBlockers: ['research_independence_separation_failed'],
    integrityRepairStage: 'dissertation_defense',
    integrityRepairRequiresCandidateWork: false,
    runs: [], evidence: [],
  })
  assert.equal(dissertation.workKind, null)
  assert.equal(dissertation.reason, 'independent_dissertation_committee_required')
})

test('protocol design never claims that an experiment was executed', () => {
  const protocol = decision('preregistered_experiment_incomplete')
  assert.equal(protocol.workKind, 'experiment_protocol_design')
  const submitted = decision('preregistered_experiment_incomplete', [{
    workKind: 'experiment_protocol_design', attemptIndex: 0, status: 'submitted', completedAt: '2027-01-01T00:00:00Z',
  }])
  assert.equal(submitted.reason, 'governed_experiment_execution_required')

  const runner = file('lib/ai/cos/cosUniversityPhdResearchRunner.ts')
  assert.match(runner, /Do not state that the experiment was run\./)
  assert.doesNotMatch(runner, /recordHostCosUniversityPhdEvidence\(/)
  assert.doesNotMatch(runner, /evaluateAndAwardCosUniversityPhdCredential\(/)
})

test('peer critique response requires independent peer review first and cannot self-resolve criticism', () => {
  assert.equal(decision('peer_critique_defense_incomplete').reason, 'independent_peer_review_required')
  const afterReview = decision('peer_critique_defense_incomplete', [{
    workKind: 'peer_review', attemptIndex: 0, status: 'submitted', completedAt: '2027-01-01T00:00:00Z',
  }])
  assert.equal(afterReview.workKind, 'peer_critique_response')
  assert.match(file('lib/ai/cos/cosUniversityPhdResearchRunner.ts'), /Do not mark the critique resolved yourself\./)
})

test('dissertation synthesis remains ungraded and waits for an independent committee', () => {
  assert.equal(decision('dissertation_defense_incomplete').workKind, 'dissertation_synthesis')
  const submitted = decision('dissertation_defense_incomplete', [{
    workKind: 'dissertation_synthesis', attemptIndex: 0, status: 'submitted', completedAt: '2027-01-01T00:00:00Z',
  }])
  assert.equal(submitted.reason, 'independent_dissertation_committee_required')
})

test('parent selection uses only current runtime-eligible positive evidence and durable failure resets', () => {
  const runner = file('lib/ai/cos/cosUniversityPhdResearchRunner.ts')
  assert.match(runner, /cosUniversityPhdEvidenceEligible\(row, now\)/)
  assert.match(runner, /currentEligibleStagePasses/)
  assert.match(runner, /parentRows = parentStage \? currentEligibleStagePasses\(input\.evidence, parentStage, input\.now\)/)
  assert.doesNotMatch(runner, /function currentStagePasses\(/)
})

test('lineage and independence blockers produce parent-aware repair context', () => {
  const runner = file('lib/ai/cos/cosUniversityPhdResearchRunner.ts')
  assert.match(runner, /function integrityRepairStage\(/)
  assert.match(runner, /function integrityRepairContext\(/)
  assert.match(runner, /research_lineage_link_failed/)
  assert.match(runner, /research_replication_target_mismatch/)
  assert.match(runner, /research_independence_separation_failed/)
  assert.match(runner, /integrityRepairAllowedParentEvidenceIds: repair\.allowedParentEvidenceIds/)
  assert.match(runner, /integrityRepairRequiresCandidateWork: repair\.requiresCandidateWork/)
  assert.match(runner, /parentEvidenceIds: record\.assignment\.parentEvidenceIds/)
})

test('orphaned assignments recover their run before stale derived context is rejected', () => {
  const runner = file('lib/ai/cos/cosUniversityPhdResearchRunner.ts')
  const recovery = runner.indexOf('await ensureRun(row.assignment_key)')
  const compare = runner.indexOf('if (row.assignment_key !== assignmentKey)')
  assert.ok(recovery >= 0)
  assert.ok(compare > recovery)
  assert.match(runner, /records\.filter\(item => !item\.run\)/)
  assert.match(runner, /assignment_context_superseded_before_claim/)
})

test('product persistence and run submission are one service-only database transaction', () => {
  const runner = file('lib/ai/cos/cosUniversityPhdResearchRunner.ts')
  const migration = file('supabase/migrations/20260908212500_cos_university_phd_research_product_atomic_submit.sql')
  assert.match(runner, /\.rpc\('cos_university_phd_submit_work_product'/)
  assert.doesNotMatch(runner, /from\('cos_university_phd_work_products'\)\.insert/)
  assert.doesNotMatch(runner, /const product = await db\.from\('cos_university_phd_work_products'\)/)
  assert.match(migration, /security invoker/i)
  assert.match(migration, /for update/i)
  assert.match(migration, /grant execute on function public\.cos_university_phd_submit_work_product/i)
  assert.match(migration, /from anon, authenticated/i)
  assert.match(migration, /p_local_model_invoked is distinct from true/)
  assert.match(migration, /p_external_ai_invoked is distinct from false/)
  assert.match(migration, /p_semantic_cache is distinct from false/)
})

test('stale recovery reconciles products before failing abandoned claims and prior context uses submitted runs only', () => {
  const runner = file('lib/ai/cos/cosUniversityPhdResearchRunner.ts')
  assert.match(runner, /const productOrphans = records\.filter\(record => record\.product && record\.run && record\.run\.status !== 'submitted'\)/)
  assert.match(runner, /&& !record\.product/)
  assert.match(runner, /record\.run\?\.status === 'submitted'/)
})

test('candidate local-model work can only be attributed to a current AI-model candidate identity', () => {
  const runner = file('lib/ai/cos/cosUniversityPhdResearchRunner.ts')
  assert.match(runner, /candidate\.actorRole !== 'candidate'/)
  assert.match(runner, /candidate\.principalType !== 'ai_model'/)
  assert.match(runner, /cosUniversityPhdActorIdentityEligible\(candidate, input\.now\)/)
})

test('research cron is secret-gated, fail-closed, bounded, and scheduled separately from credential progress', () => {
  const route = file('app/api/cron/cos-university-phd-research/route.ts')
  const vercel = JSON.parse(file('vercel.json')) as {
    env: Record<string, string>
    crons: Array<{ path: string; schedule: string }>
  }
  assert.match(route, /CRON_SECRET/)
  assert.match(route, /COS_UNIVERSITY_PHD_RESEARCH_EXECUTION_ENABLED !== 'true'/)
  assert.match(route, /academicCredit: false/)
  assert.match(route, /maxDuration = 240/)
  assert.equal(vercel.env.COS_UNIVERSITY_PHD_RESEARCH_EXECUTION_ENABLED, 'true')
  assert.deepEqual(vercel.crons.find(row => row.path === '/api/cron/cos-university-phd-research'), {
    path: '/api/cron/cos-university-phd-research', schedule: '21 * * * *',
  })
})

test('research worker requires fresh local non-cache model work and does not expose a browser write route', () => {
  const runner = file('lib/ai/cos/cosUniversityPhdResearchRunner.ts')
  assert.match(runner, /ensureLocalInferenceRuntimeReady/)
  assert.match(runner, /generateLocalEmbedding/)
  assert.match(runner, /disableCache: true/)
  assert.match(runner, /localModelInvoked/)
  assert.match(runner, /!result\.provenance\.externalAiInvoked/)
  assert.match(runner, /fresh_local_research_execution_required/)
  assert.doesNotMatch(file('app/api/admin/cos-university-phd/route.ts'), /ResearchRunner|ResearchAssignment|ResearchProduct/)
})
