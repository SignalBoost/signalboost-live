// saas/tests/cosUniversityFrontierDistillation.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  COS_UNIVERSITY_FRONTIER_DISTILLATION_PROFILE,
  buildFrontierDistillationPlan,
} from '../lib/ai/cos/cosUniversityFrontierDistillation.ts'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('frontier distillation defaults to on-policy GKD with a bounded off-policy anchor', () => {
  const plan = buildFrontierDistillationPlan({
    studentModelId: 'Qwen/Qwen3-4B',
    denseTeacherModelId: 'Qwen/Qwen3-8B',
    denseTeacherRevision: 'a'.repeat(40),
    denseTeacherLicense: 'apache-2.0',
    frontierFaculty: ['openai', 'claude', 'gemini', 'grok'],
    env: {},
  })
  assert.equal(plan.profile, COS_UNIVERSITY_FRONTIER_DISTILLATION_PROFILE)
  assert.equal(plan.optimizer, 'gkd_on_policy')
  assert.equal(plan.onPolicyFraction, 0.85)
  assert.equal(plan.offPolicyAnchorFraction, 0.15)
  assert.equal(plan.beta, 0.5)
  assert.equal(plan.temperature, 0.8)
  assert.deepEqual(plan.frontierFaculty, ['openai', 'claude', 'gemini', 'grok'])
  assert.equal(plan.studentGeneratedRolloutsRequired, true)
  assert.equal(plan.independentEvaluationRequired, true)
  assert.equal(plan.exactArtifactCanaryRequired, true)
  assert.equal(plan.rollbackProofRequired, true)
  assert.equal(plan.automaticPromotionAuthorized, false)
  assert.equal(plan.authorityExpanded, false)
})

test('frontier plan refuses an unpinned, same-model or non-open dense teacher', () => {
  assert.throws(() => buildFrontierDistillationPlan({
    studentModelId: 'Qwen/Qwen3-4B',
    denseTeacherModelId: 'Qwen/Qwen3-4B',
    denseTeacherRevision: 'a'.repeat(40),
    denseTeacherLicense: 'apache-2.0',
  }), /teacher_student_identity_invalid/)

  assert.throws(() => buildFrontierDistillationPlan({
    studentModelId: 'Qwen/Qwen3-4B',
    denseTeacherModelId: 'Qwen/Qwen3-8B',
    denseTeacherRevision: 'main',
    denseTeacherLicense: 'apache-2.0',
  }), /teacher_revision_invalid/)

  assert.throws(() => buildFrontierDistillationPlan({
    studentModelId: 'Qwen/Qwen3-4B',
    denseTeacherModelId: 'Qwen/Qwen3-8B',
    denseTeacherRevision: 'a'.repeat(40),
    denseTeacherLicense: 'other',
  }), /teacher_rights_invalid/)
})

test('mass distillation carries the frontier plan into the governed training envelope', () => {
  const consumer = source('../lib/ai/cos/cosUniversityMassDistillationConsumer.ts')
  assert.match(consumer, /buildFrontierDistillationPlan/)
  assert.match(consumer, /COS_UNIVERSITY_HF_DENSE_TEACHER_MODEL/)
  assert.match(consumer, /distillationPlan,/)
  assert.match(consumer, /frontier-train/)
  assert.match(consumer, /source-teacher:/)
  assert.match(consumer, /frontier-plan:/)
})

test('HF worker executes real GKD for frontier mass distillation and fails closed on tokenizer mismatch', () => {
  const worker = source('../scripts/cos-university-hf-worker.py')
  assert.match(worker, /from trl import GKDConfig, GKDTrainer, SFTConfig, SFTTrainer/)
  assert.match(worker, /optimizer": "gkd_on_policy"/)
  assert.match(worker, /studentGenerated|frontier_plan/)
  assert.match(worker, /GKDTrainer\(/)
  assert.match(worker, /teacher_model=teacher_model/)
  assert.match(worker, /lmbda=recipe\["onPolicyFraction"\]/)
  assert.match(worker, /beta=recipe\["beta"\]/)
  assert.match(worker, /worker_frontier_distillation_tokenizer_mismatch_requires_gold/)
  assert.match(worker, /legacy_bootstrap_sft/)
})
