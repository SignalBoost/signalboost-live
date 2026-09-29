// saas/tests/xsaExamPause.node.test.ts
//
// Production 2026-09-29: XSA students answered exam questions in 37-44s (standard students 4.0s) and 24 of 48 answers
// hit the 50s per-answer limit, so no XSA exam could finish while each attempt still paid for a RunPod wake. XSA
// students are therefore neither canaried nor examined until the XSA runtime is fast enough. They stay PENDING.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { MASS_XSA_EXAMS_PAUSED, xsaExamPaused } from '../lib/ai/cos/cosUniversityXsaExamPause.ts'
import { decideRollingMassEvaluationApproval } from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'
import { decideMassCanaryRollingApproval, type CanaryArtifact } from '../lib/ai/cos/cosUniversityMassCanaryRollingAuthority.ts'

const now = new Date('2026-09-29T16:00:00.000Z')
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()

test('XSA exams are paused and only XSA students are affected', () => {
  assert.equal(MASS_XSA_EXAMS_PAUSED, true)
  assert.equal(xsaExamPaused({ xsa: true }), true)
  assert.equal(xsaExamPaused({ attentionArchitecture: 'exclusive_self_attention_v1' }), true)
  assert.equal(xsaExamPaused({ xsa: false }), false)
  assert.equal(xsaExamPaused({ attentionArchitecture: 'standard_attention' }), false)
  assert.equal(xsaExamPaused({}), false)
})

test('no exam approval for an XSA student; a standard student still goes through the normal gates', () => {
  const artifact = (id: string, xsa: boolean) => ({
    candidateId: `mass:${id}`, subjectId: 'Business & Operations', artifactHash: id.repeat(64).slice(0, 64),
    createdAt: hoursAgo(30), frontierRecipe: false, builderV2: false, remediationReplay: false, xsa,
  })
  const decision: any = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifact('a', true), artifact('b', false)],
    events: [],
    now,
    frontierProofCompletions: 99,
    builderV2ProofCompletions: 99,
    remediationReplayProofCompletions: 99,
    inFlightCount: 0,
  })
  assert.equal(decision.issue, false)
  assert.deepEqual({ ...decision.skipped }, { xsa_exam_paused: 1, no_exact_healthy_canary: 1 })
})

test('no canary for an XSA student; a standard student is still canaried', () => {
  const artifact = (id: string, attentionArchitecture: CanaryArtifact['attentionArchitecture'], ageHours: number): CanaryArtifact => ({
    candidateId: `mass:${id}`, subjectId: 'History', artifactHash: id.repeat(64).slice(0, 64),
    createdAt: hoursAgo(ageHours), attentionArchitecture,
  })
  const onlyXsa: any = decideMassCanaryRollingApproval({ artifacts: [artifact('e', 'exclusive_self_attention_v1', 5)], events: [], now, enabled: true })
  assert.equal(onlyXsa.issue, false)
  const mixed: any = decideMassCanaryRollingApproval({
    artifacts: [artifact('e', 'exclusive_self_attention_v1', 5), artifact('c', 'standard_attention', 3)],
    events: [],
    now,
    enabled: true,
  })
  assert.equal(mixed.artifact?.candidateId, 'mass:c')
})

test('the exam route passes the training receipt XSA flag to the approval rules', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')
  assert.match(route, /xsa: receipt\.xsaTrainingApplied === true,/)
})
