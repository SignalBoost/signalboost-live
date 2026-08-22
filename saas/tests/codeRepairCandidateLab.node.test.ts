import test from 'node:test'
import assert from 'node:assert/strict'
import { createCandidateLabEvidence, createCandidateLabHumanReviewPacket, createCandidateLabSandboxEvaluator, createCodeRepairPatchProposal, fingerprintCandidateLabCohort, fingerprintCodeRepairProposal, evaluateCandidateLab, runCandidateLab } from '../lib/code-repair/index.ts'
import type { CodeRepairValidationCommand, CodeRepairValidationWorkspace } from '../lib/code-repair/index.ts'

const baseline = [
  { caseId: 'a', passed: true, governancePassed: true, qualityScore: 0.7 },
  { caseId: 'b', passed: false, governancePassed: true, qualityScore: 0.4 },
  { caseId: 'c', passed: true, governancePassed: true, qualityScore: 0.6 },
] as const

test('Candidate Lab recommends only an improved identical governed cohort and never enables automatic promotion', () => {
  const result = evaluateCandidateLab({
    candidateId: 'candidate-1', baseline,
    candidate: [
      { caseId: 'a', passed: true, governancePassed: true, qualityScore: 0.8 },
      { caseId: 'b', passed: true, governancePassed: true, qualityScore: 0.7 },
      { caseId: 'c', passed: true, governancePassed: true, qualityScore: 0.7 },
    ],
  })
  assert.equal(result.recommendedForHumanReview, true)
  assert.equal(result.automaticPromotionAllowed, false)
  assert.deepEqual(result.reasons, ['recommend_human_review'])
  assert.equal(result.passRateDelta, 1 / 3)
})

test('Candidate Lab fails closed for mismatched cohorts, governance regressions, and no measurable improvement', () => {
  const mismatch = evaluateCandidateLab({ candidateId: 'candidate-2', baseline, candidate: baseline.slice(0, 2) })
  assert.equal(mismatch.recommendedForHumanReview, false)
  assert.ok(mismatch.reasons.includes('cohort_mismatch'))

  const unsafe = evaluateCandidateLab({ candidateId: 'candidate-3', baseline, candidate: baseline.map(item => ({ ...item, governancePassed: item.caseId !== 'c', qualityScore: item.qualityScore + 0.2 })) })
  assert.equal(unsafe.recommendedForHumanReview, false)
  assert.ok(unsafe.reasons.includes('candidate_governance_regression'))

  const unchanged = evaluateCandidateLab({ candidateId: 'candidate-4', baseline, candidate: baseline })
  assert.equal(unchanged.recommendedForHumanReview, false)
  assert.ok(unchanged.reasons.includes('no_measured_improvement'))
})

test('Candidate Lab rejects duplicate and malformed observations instead of treating them as evidence', () => {
  const result = evaluateCandidateLab({
    candidateId: 'candidate-5', baseline: [...baseline, { ...baseline[0] }], candidate: baseline,
  })
  assert.equal(result.recommendedForHumanReview, false)
  assert.ok(result.reasons.includes('duplicate_case_id'))
  assert.ok(result.reasons.includes('cohort_mismatch'))
})

test('Candidate Lab evidence binds its result to an exact patch fingerprint and stable cohort snapshots', () => {
  const proposal = createCodeRepairPatchProposal({
    planId: 'plan-1', incidentId: 'incident-1', diagnosisFingerprint: 'diagnosis', problem: 'test', rationale: 'test', riskLevel: 'low', filesToInspect: ['src/a.ts'], filesAllowedToModify: ['src/a.ts'], testsToRun: [], steps: [], requiresHumanApproval: true, patchGenerationAllowed: false, patchApplicationAllowed: false, mergeAllowed: false,
  }, 'base-1', '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n')
  const patchFingerprint = fingerprintCodeRepairProposal(proposal)
  const evidence = createCandidateLabEvidence({ candidateId: 'candidate-6', baseline, candidate: baseline.map(item => ({ ...item, qualityScore: item.qualityScore + 0.1 })) }, patchFingerprint)
  assert.equal(evidence.candidateChangeFingerprint, patchFingerprint)
  assert.equal(evidence.humanApprovalRequired, true)
  assert.equal(evidence.automaticPromotionAllowed, false)
  assert.equal(evidence.baselineCohortFingerprint, fingerprintCandidateLabCohort([...baseline].reverse()))
  assert.notEqual(evidence.candidateCohortFingerprint, evidence.baselineCohortFingerprint)
  assert.throws(() => createCandidateLabEvidence({ candidateId: 'candidate-7', baseline, candidate: baseline }, ''), /fingerprint/)
})

test('Candidate Lab executes a fixed matched cohort for baseline and candidate before producing evidence', async () => {
  const calls: string[] = []
  const result = await runCandidateLab({
    candidateId: 'candidate-8', baselineChangeFingerprint: 'baseline-patch', candidateChangeFingerprint: 'candidate-patch', cases: [{ caseId: 'a' }, { caseId: 'b' }, { caseId: 'c' }],
    evaluator: { async evaluate(input) { calls.push(`${input.caseId}:${input.candidateChangeFingerprint}`); return { passed: input.candidateChangeFingerprint === 'candidate-patch' || input.caseId !== 'b', governancePassed: true, qualityScore: input.candidateChangeFingerprint === 'candidate-patch' ? 0.8 : 0.5 } } },
  })
  assert.equal(result.completed, true)
  assert.equal(result.evidence?.evaluation.recommendedForHumanReview, true)
  assert.deepEqual(calls, ['a:baseline-patch', 'a:candidate-patch', 'b:baseline-patch', 'b:candidate-patch', 'c:baseline-patch', 'c:candidate-patch'])
})

test('Candidate Lab creates no evidence when either side cannot be evaluated or cases are invalid', async () => {
  const failed = await runCandidateLab({ candidateId: 'candidate-9', baselineChangeFingerprint: 'baseline', candidateChangeFingerprint: 'candidate', cases: [{ caseId: 'a' }], evaluator: { async evaluate() { throw new Error('sandbox unavailable') } } })
  assert.equal(failed.completed, false)
  assert.equal(failed.evidence, null)
  assert.equal(failed.failures.length, 2)

  const duplicate = await runCandidateLab({ candidateId: 'candidate-10', baselineChangeFingerprint: 'baseline', candidateChangeFingerprint: 'candidate', cases: [{ caseId: 'a' }, { caseId: 'a' }], evaluator: { async evaluate() { return { passed: true, governancePassed: true, qualityScore: 1 } } } })
  assert.equal(duplicate.completed, false)
  assert.equal(duplicate.evidence, null)
})

test('Candidate Lab sandbox evaluator uses disposable baseline/candidate workspaces and stages only the candidate patch', async () => {
  const plan: any = { planId: 'plan-2', incidentId: 'incident-2', diagnosisFingerprint: 'diagnosis', problem: 'test', rationale: 'test', riskLevel: 'low', filesToInspect: ['src/a.ts'], filesAllowedToModify: ['src/a.ts'], testsToRun: [], steps: [], requiresHumanApproval: true, patchGenerationAllowed: false, patchApplicationAllowed: false, mergeAllowed: false }
  const proposal = createCodeRepairPatchProposal(plan, 'base-2', '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n')
  const candidateFingerprint = fingerprintCodeRepairProposal(proposal)
  const calls: string[] = []
  const workspace: CodeRepairValidationWorkspace = {
    async create(input) { calls.push(`create:${input.workspaceId}`); return { id: input.workspaceId } },
    async stageUnifiedDiff(_workspace, diff) { calls.push(`stage:${diff.includes('+new')}`) },
    async run(workspace, command: CodeRepairValidationCommand) { calls.push(`run:${workspace.id}:${command.id}`); const candidate = workspace.id.includes(candidateFingerprint.slice(0, 24)); return { commandId: command.id, succeeded: candidate || command.id !== 'tests', exitCode: candidate || command.id !== 'tests' ? 0 : 1, timedOut: false, safeOutput: 'ok' } },
    async destroy(workspace) { calls.push(`destroy:${workspace.id}`) },
  }
  const evaluator = createCandidateLabSandboxEvaluator({ baselineChangeFingerprint: 'baseline-2', candidateProposal: proposal, workspace, cases: [{ caseId: 'verification', commands: [{ id: 'typecheck', command: 'npm run typecheck', timeoutMs: 100 }, { id: 'tests', command: 'npm test', timeoutMs: 100 }] }] })
  const result = await runCandidateLab({ candidateId: 'candidate-11', baselineChangeFingerprint: 'baseline-2', candidateChangeFingerprint: candidateFingerprint, cases: [{ caseId: 'verification' }], evaluator, minimumMatchedCases: 1 })
  assert.equal(result.completed, true)
  assert.equal(result.evidence?.evaluation.recommendedForHumanReview, true)
  assert.equal(calls.filter(call => call.startsWith('stage:')).length, 1)
  assert.equal(calls.filter(call => call.startsWith('create:')).length, 2)
  assert.equal(calls.filter(call => call.startsWith('destroy:')).length, 2)
})

test('Candidate Lab human review packet requires the exact patch, clean validation, and approval-only review', () => {
  const plan: any = { planId: 'plan-3', incidentId: 'incident-3', diagnosisFingerprint: 'diagnosis', problem: 'test', rationale: 'test', riskLevel: 'low', filesToInspect: ['src/a.ts'], filesAllowedToModify: ['src/a.ts'], testsToRun: [], steps: [], requiresHumanApproval: true, patchGenerationAllowed: false, patchApplicationAllowed: false, mergeAllowed: false }
  const proposal = createCodeRepairPatchProposal(plan, 'base-3', '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n')
  const evidence = createCandidateLabEvidence({ candidateId: 'candidate-12', baseline, candidate: baseline.map(item => ({ ...item, qualityScore: item.qualityScore + 0.2 })) }, fingerprintCodeRepairProposal(proposal))
  const validation: any = { proposalId: proposal.proposalId, validated: true, cleanupSucceeded: true, repositoryModified: false, networkAccessAllowed: false, results: [] }
  const review: any = { proposalId: proposal.proposalId, verdict: 'approve', validationPassed: true, requiresHumanApproval: true, applicationAllowed: false, mergeAllowed: false }
  const packet = createCandidateLabHumanReviewPacket(proposal, evidence, validation, review)
  assert.equal(packet.applicationAllowed, false)
  assert.equal(packet.mergeAllowed, false)
  assert.throws(() => createCandidateLabHumanReviewPacket({ ...proposal, unifiedDiff: proposal.unifiedDiff.replace('+new', '+other') }, evidence, validation, review), /not bound/)
  assert.throws(() => createCandidateLabHumanReviewPacket(proposal, evidence, { ...validation, networkAccessAllowed: true }, review), /clean isolated/)
})
