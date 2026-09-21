// saas/tests/cosUniversityFrontierDistillation.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  COS_UNIVERSITY_FRONTIER_DISTILLATION_PROFILE,
  buildFrontierDistillationPlan,
} from '../lib/ai/cos/cosUniversityFrontierDistillation.ts'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('frontier distillation keeps GKD on-policy and requires a bounded frontier-response anchor', () => {
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
  assert.equal(plan.onPolicyFraction, 1)
  assert.equal(plan.offPolicyAnchorFraction, 0)
  assert.equal(plan.frontierResponseAnchorRequired, true)
  assert.equal(plan.frontierResponseAnchorEpochs, 1)
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

test('frontier response anchor is disabled when no hosted faculty produced verified responses', () => {
  const plan = buildFrontierDistillationPlan({
    studentModelId: 'Qwen/Qwen3-4B',
    denseTeacherModelId: 'Qwen/Qwen3-8B',
    denseTeacherRevision: 'a'.repeat(40),
    denseTeacherLicense: 'apache-2.0',
    frontierFaculty: [],
    env: {},
  })
  assert.equal(plan.onPolicyFraction, 1)
  assert.equal(plan.offPolicyAnchorFraction, 0)
  assert.equal(plan.frontierResponseAnchorRequired, false)
  assert.equal(plan.frontierResponseAnchorEpochs, 0)
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
  assert.match(consumer, /actualFrontierFaculty/)
  assert.match(consumer, /readMassHostedTeacherRows/)
})

test('HF worker uses stable on-policy DistillationTrainer and fails closed on tokenizer mismatch', () => {
  const worker = source('../scripts/cos-university-hf-worker.py')
  assert.match(worker, /from trl import DistillationConfig, DistillationTrainer, SFTConfig, SFTTrainer/)
  assert.match(worker, /cos-university-frontier-adaptive-distillation-v2/)
  assert.match(worker, /optimizer": "frontier_response_anchor_then_stable_on_policy_distillation"/)
  assert.match(worker, /frontierResponseAnchorRequired/)
  assert.match(worker, /frontierResponseAnchorEpochs/)
  assert.match(worker, /frontierResponseAnchorItems/)
  assert.match(worker, /anchor_trainer = SFTTrainer\(/)
  assert.match(worker, /anchor_trainer\.train\(\)/)
  assert.match(worker, /anchored_student = anchor_trainer\.model/)
  assert.match(worker, /DistillationTrainer\(/)
  assert.match(worker, /teacher_model=teacher_model/)
  assert.match(worker, /"beta": recipe\["beta"\]/)
  assert.match(worker, /"max_completion_length": recipe\["maxNewTokens"\]/)
  const trainingFunction = worker.slice(worker.indexOf('def train_student'), worker.indexOf('def main()'))
  assert.match(trainingFunction, /use_bf16 = False/)
  assert.match(trainingFunction, /compute_dtype = torch\.float16/)
  assert.doesNotMatch(trainingFunction, /torch\.cuda\.is_bf16_supported\(\)/)
  assert.match(trainingFunction, /bf16=False,[\s\S]*fp16=False/)
  assert.match(trainingFunction, /trainable_fp32_tensors = _force_trainable_fp32\(trainer\.model\)/)
  assert.match(trainingFunction, /recipe\["ampEnabled"\] = False/)
  assert.match(worker, /def _force_trainable_fp32\(model\)/)
  assert.match(worker, /parameter\.data = parameter\.data\.to\(torch\.float32\)/)
  assert.match(worker, /worker_frontier_distillation_tokenizer_mismatch_requires_gold/)
  assert.match(worker, /worker_frontier_response_anchor_contract_invalid/)
  assert.match(worker, /worker_frontier_response_anchor_epochs_invalid/)
  const anchorTrain = trainingFunction.indexOf('anchor_trainer.train()')
  const denseTeacherLoad = trainingFunction.indexOf('teacher_model = AutoModelForCausalLM.from_pretrained')
  const gkdTrainer = trainingFunction.indexOf('trainer = DistillationTrainer(')
  assert.ok(anchorTrain > 0 && denseTeacherLoad > anchorTrain && gkdTrainer > denseTeacherLoad)
  assert.match(worker, /legacy_bootstrap_sft/)
})

test('HF frontier runtime pins the stable TRL distillation API', () => {
  const jobs = source('../lib/ai/cos/cosUniversityHuggingFaceJobs.ts')
  assert.match(jobs, /'transformers>=4\.56\.2,<6'/)
  assert.match(jobs, /'trl==1\.10\.0'/)
})

test('HF worker reuses bounded Hub repositories and pins isolated run revisions', () => {
  const worker = source('../scripts/cos-university-hf-worker.py')
  assert.match(worker, /def _pooled_hub_repo/)
  assert.match(worker, /api\.list_models\(author=namespace, search=prefix, limit=500, token=token\)/)
  assert.match(worker, /api\.list_datasets\(author=namespace, search=prefix, limit=500, token=token\)/)
  assert.match(worker, /branch_name = f"run-\{base\.sha256\(identity\)\[:24\]\}"/)
  assert.match(worker, /revision=output_branch/)
  assert.match(worker, /worker_repo_pool_unavailable_rate_limited/)
  assert.doesNotMatch(worker, /output_repo = f"\{namespace\}\/itmounts-student-\{base\.sha256\(candidate_id \+ ':' \+ job_id\)\[:12\]\}"/)
})


test('mass artifact evidence durably records the executed frontier training recipe', () => {
  const consumer = source('../lib/ai/cos/cosUniversityMassDistillationConsumer.ts')
  assert.match(consumer, /function durableTrainingReceipt/)
  assert.match(consumer, /trainingReceipt = durableTrainingReceipt\(body\.trainingProfile, body\.trainingRecipe\)/)
  assert.match(consumer, /trainingMode: 'distillation', trainingReceipt/)
  assert.match(consumer, /\|\| !trainingReceipt\)/)
  assert.match(consumer, /teacherModel: run\.teacher_model_id \|\| null,[\s\S]*trainingReceipt,[\s\S]*nextGate: 'independent_evaluation'/)
})
