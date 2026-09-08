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
    workKind: 'primary_literature_research',
    attemptIndex: 0,
    status: 'submitted',
    completedAt: '2027-01-01T00:00:00Z',
  }])
  assert.equal(submitted.workKind, null)
  assert.equal(submitted.reason, 'awaiting_independent_evaluation')

  const hypothesis = decision('hypothesis_proposal_incomplete')
  assert.equal(hypothesis.workKind, 'hypothesis_development')
})

test('a later independent failure reopens candidate research with a new attempt', () => {
  const retry = decision('hypothesis_proposal_incomplete', [{
    workKind: 'hypothesis_development',
    attemptIndex: 0,
    status: 'submitted',
    completedAt: '2027-01-01T00:00:00Z',
  }], [{
    stage: 'hypothesis_proposal',
    passed: false,
    observedAt: '2027-01-02T00:00:00Z',
  }])
  assert.equal(retry.workKind, 'hypothesis_development')
  assert.equal(retry.attemptIndex, 1)
})

test('protocol design never claims that an experiment was executed', () => {
  const protocol = decision('preregistered_experiment_incomplete')
  assert.equal(protocol.workKind, 'experiment_protocol_design')
  const submitted = decision('preregistered_experiment_incomplete', [{
    workKind: 'experiment_protocol_design',
    attemptIndex: 0,
    status: 'submitted',
    completedAt: '2027-01-01T00:00:00Z',
  }])
  assert.equal(submitted.reason, 'governed_experiment_execution_required')

  const runner = file('lib/ai/cos/cosUniversityPhdResearchRunner.ts')
  assert.match(runner, /Do not state that the experiment was run\./)
  assert.doesNotMatch(runner, /recordHostCosUniversityPhdEvidence\(/)
  assert.doesNotMatch(runner, /evaluateAndAwardCosUniversityPhdCredential\(/)
})

test('peer critique response requires independent peer review first and cannot self-resolve criticism', () => {
  const noReview = decision('peer_critique_defense_incomplete')
  assert.equal(noReview.reason, 'independent_peer_review_required')

  const afterReview = decision('peer_critique_defense_incomplete', [{
    workKind: 'peer_review',
    attemptIndex: 0,
    status: 'submitted',
    completedAt: '2027-01-01T00:00:00Z',
  }])
  assert.equal(afterReview.workKind, 'peer_critique_response')
  assert.equal(afterReview.reason, 'schedule_candidate_research')

  const runner = file('lib/ai/cos/cosUniversityPhdResearchRunner.ts')
  assert.match(runner, /Do not mark the critique resolved yourself\./)
})

test('dissertation synthesis remains ungraded and waits for an independent committee', () => {
  const work = decision('dissertation_defense_incomplete')
  assert.equal(work.workKind, 'dissertation_synthesis')
  const submitted = decision('dissertation_defense_incomplete', [{
    workKind: 'dissertation_synthesis',
    attemptIndex: 0,
    status: 'submitted',
    completedAt: '2027-01-01T00:00:00Z',
  }])
  assert.equal(submitted.reason, 'independent_dissertation_committee_required')
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
