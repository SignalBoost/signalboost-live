import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

test('research scheduling applies the canonical-shaped durable failure envelope', () => {
  const runner = file('lib/ai/cos/cosUniversityPhdResearchRunner.ts')
  assert.match(runner, /function failureResetEligibleForResearch\(/)
  assert.match(runner, /row\.authority !== cosUniversityPhdExpectedAuthority\(row\.stage\)/)
  assert.match(runner, /row\.identityProvenance !== 'host_identity_ledger'/)
  assert.match(runner, /evaluatorSet\.has\(candidate\)/)
  assert.match(runner, /failureResetEligibleForResearch\(row, now\)/)
  assert.doesNotMatch(runner, /: Number\.isFinite\(Date\.parse\(row\.observedAt\)\)/)
})

test('durable failure resets validate normalized parent IDs and reject self-parenting', () => {
  const runner = file('lib/ai/cos/cosUniversityPhdResearchRunner.ts')
  assert.match(runner, /function parentIdsEligibleForResearch\(/)
  assert.match(runner, /row\.parentEvidenceIds === undefined/)
  assert.match(runner, /const parents = normalizedDistinctIds\(row\.parentEvidenceIds\)/)
  assert.match(runner, /!parents\.ids\.includes\(clean\(row\.evidenceId, 300\)\)/)
  assert.match(runner, /if \(!parentIdsEligibleForResearch\(row\)\) return false/)
})

test('evidence identity collision repair uses normalized IDs', () => {
  const runner = file('lib/ai/cos/cosUniversityPhdResearchRunner.ts')
  assert.match(runner, /blockers\.includes\('research_evidence_identity_collision'\)/)
  assert.match(runner, /const evidenceId = clean\(row\.evidenceId, 300\)/)
  assert.match(runner, /if \(seen\.has\(evidenceId\)\) return stage/)
  assert.match(runner, /previousById = new Map\(\(current\.get\(previousStage\) \|\| \[\]\)\.map\(row => \[clean\(row\.evidenceId, 300\), row\]\)\)/)
})

test('research execution binds the immutable candidate principal to the actual reasoner label', () => {
  const runner = file('lib/ai/cos/cosUniversityPhdResearchRunner.ts')
  assert.match(runner, /result\.provenance\.reasonerLabel/)
  assert.match(runner, /candidateMatchesReasoner/)
  assert.match(runner, /principalFingerprint, 500\) === reasonerFingerprint/)
  assert.match(runner, /research_reasoner_principal_mismatch/)
})

test('candidate identity is revalidated at the same completion timestamp used for submission', () => {
  const runner = file('lib/ai/cos/cosUniversityPhdResearchRunner.ts')
  assert.match(runner, /const completedAt = new Date\(\)/)
  assert.match(runner, /cosUniversityPhdActorIdentityEligible\(candidateIdentity, completedAt\)/)
  assert.match(runner, /submittedAt: completedAt/)
  assert.match(runner, /failCandidateAssignment\(assignment, failureReason, completedAt\)/)
})

test('expired orphan assignments recover directly to failed instead of blocking retry forever', () => {
  const runner = file('lib/ai/cos/cosUniversityPhdResearchRunner.ts')
  assert.match(runner, /expiredCreatedKeys/)
  assert.match(runner, /record\.run\?\.status === 'created'/)
  assert.match(runner, /Date\.parse\(record\.assignment\.notAfter\) <= now\.getTime\(\)/)
  assert.match(runner, /expired_research_assignment_recovered/)
})

test('principal-level independence failures participate in repair-stage routing', () => {
  const runner = file('lib/ai/cos/cosUniversityPhdResearchRunner.ts')
  assert.match(runner, /async function principalIndependenceRepairStage\(/)
  assert.match(runner, /status\.principalIndependence\.reasons/)
  assert.match(runner, /combinedBlockers/)
  assert.match(runner, /phd_principal_independence_separation_failed/)
  assert.match(runner, /phd_candidate_principal_not_independent/)
  assert.match(runner, /integrityRepairContext\(evidence, combinedBlockers, now, principalRepair\)/)
})

test('atomic product retry preserves the original immutable product and run provenance pair', () => {
  const migration = file('supabase/migrations/20260908212500_cos_university_phd_research_product_atomic_submit.sql')
  assert.match(migration, /v_existing_source_ref/)
  assert.match(migration, /v_existing_submitted_at/)
  assert.match(migration, /v_run_completed_at is distinct from p_submitted_at/)
  assert.match(migration, /v_run_turn_id is distinct from p_turn_id/)
  assert.match(migration, /v_run_response_source is distinct from p_response_source/)
  assert.match(migration, /if v_run_status <> 'submitted'/)
  assert.match(migration, /return true;\n  end if;\n\n  if v_run_status <> 'running'/)
})
