import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  buildDistillationTeacherPromptSet,
  COS_UNIVERSITY_TEACHER_DATASET_PROFILE,
  DEFAULT_DISTILLATION_STUDENT_MODEL,
  DEFAULT_DISTILLATION_TEACHER_MODEL,
  validateTeacherDatasetCallbackBinding,
} from '../lib/ai/cos/cosUniversityDistillationTeacherDataset.ts'
import {
  buildHuggingFaceJobSpec,
  huggingFaceJobsConfigFromEnv,
  resolveHuggingFaceHardwareRate,
  resolveHuggingFaceModelMetadata,
} from '../lib/ai/cos/cosUniversityHuggingFaceJobs.ts'

const token = `hf_${'a'.repeat(48)}`
const commit = '1'.repeat(40)
const teacherRevision = '2'.repeat(40)
const studentRevision = '3'.repeat(40)

function hfEnv(extra: Record<string, string | undefined> = {}) {
  return {
    HF_TOKEN: token,
    VERCEL_URL: 'signalboost-live-example.vercel.app',
    VERCEL_GIT_COMMIT_SHA: commit,
    ...extra,
  }
}

function teacherEnvelope() {
  const prompts = buildDistillationTeacherPromptSet('reasoning_decision_science')
  return {
    profile: 'cos_university_training_executor_v1',
    operation: 'generate_teacher_dataset',
    candidateId: 'study-plan:00000000-0000-4000-8000-000000000001',
    subjectId: 'reasoning_decision_science',
    promptProfile: COS_UNIVERSITY_TEACHER_DATASET_PROFILE,
    promptSetHash: prompts.promptSetHash,
    prompts: prompts.prompts,
    teacher: { modelId: DEFAULT_DISTILLATION_TEACHER_MODEL, revision: teacherRevision, license: 'apache-2.0' },
    student: { modelId: DEFAULT_DISTILLATION_STUDENT_MODEL, revision: studentRevision, license: 'apache-2.0' },
    trainingRights: 'open_license',
    studentControlledByBuyer: true,
    containsPrivateProductionData: false,
    callbackPath: '/api/internal/cos/university-distillation-teacher/evidence',
    authorityExpanded: false,
  }
}

test('teacher prompt bank is public synthetic reasoning practice with 64 unique cases and no candidate content', () => {
  const result = buildDistillationTeacherPromptSet('reasoning_decision_science')
  assert.equal(result.prompts.length, 64)
  assert.equal(new Set(result.prompts.map(item => item.id)).size, 64)
  assert.match(result.promptSetHash, /^[a-f0-9]{64}$/)
  for (const item of result.prompts) {
    assert.match(item.prompt, /Standalone public practice case/)
    assert.match(item.prompt, /Do not reveal hidden chain-of-thought/)
    assert.doesNotMatch(item.prompt, /study-plan:/)
    assert.doesNotMatch(item.prompt, /7bb8ce24|b333a2be|manifest_hash|source_ref/i)
  }
})

test('teacher dataset generation fails closed for subjects without a public prompt curriculum', () => {
  assert.throws(() => buildDistillationTeacherPromptSet('computer_science'), /subject_not_supported/)
})

test('default teacher/student remain separated open-weight Qwen models', () => {
  assert.equal(DEFAULT_DISTILLATION_TEACHER_MODEL, 'Qwen/Qwen3-8B')
  assert.equal(DEFAULT_DISTILLATION_STUDENT_MODEL, 'Qwen/Qwen3-4B')
  assert.notEqual(DEFAULT_DISTILLATION_TEACHER_MODEL, DEFAULT_DISTILLATION_STUDENT_MODEL)
})

test('HF model metadata is bound to an immutable model revision and explicit license', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    id: 'Qwen/Qwen3-8B',
    sha: teacherRevision,
    disabled: false,
    tags: ['license:apache-2.0'],
    cardData: { license: 'apache-2.0' },
  }), { status: 200, headers: { 'content-type': 'application/json' } })
  const model = await resolveHuggingFaceModelMetadata({ modelId: 'Qwen/Qwen3-8B', token, fetchImpl })
  assert.deepEqual(model, { modelId: 'Qwen/Qwen3-8B', revision: teacherRevision, license: 'apache-2.0' })
})

test('HF live hardware rate converts per-minute T4 price to an hourly ceiling input', async () => {
  const fetchImpl = async () => new Response(JSON.stringify([
    {
      name: 't4-small', prettyName: 'Nvidia T4 - small', unitCostUSD: 0.006667, unitLabel: 'minute',
      accelerator: { type: 'gpu', model: 'T4', manufacturer: 'Nvidia', quantity: '1' },
    },
  ]), { status: 200, headers: { 'content-type': 'application/json' } })
  const rate = await resolveHuggingFaceHardwareRate({ flavor: 't4-small', token, fetchImpl })
  assert.equal(rate.flavor, 't4-small')
  assert.equal(rate.accelerator?.manufacturer, 'Nvidia')
  assert.equal(rate.hourlyCostUsd, 0.40002)
})

test('owner hourly hardware ceiling defaults to $1 and cannot be raised by environment configuration', () => {
  const normal = huggingFaceJobsConfigFromEnv(hfEnv())!
  const attemptedRaise = huggingFaceJobsConfigFromEnv(hfEnv({ COS_UNIVERSITY_HF_MAX_HOURLY_COST_USD: '12' }))!
  const lowered = huggingFaceJobsConfigFromEnv(hfEnv({ COS_UNIVERSITY_HF_MAX_HOURLY_COST_USD: '0.50' }))!
  assert.equal(normal.maxHourlyCostUsd, 1)
  assert.equal(attemptedRaise.maxHourlyCostUsd, 1)
  assert.equal(lowered.maxHourlyCostUsd, 0.5)
})

test('teacher dataset job uses T4 Small, a 30-minute ceiling, encrypted token and no hardware escalation', () => {
  const config = huggingFaceJobsConfigFromEnv(hfEnv())!
  const spec = buildHuggingFaceJobSpec({
    envelope: teacherEnvelope(),
    callbackUrl: 'https://itmounts.com/api/internal/cos/university-distillation-teacher/evidence',
    idempotencyKey: 'teacher-key',
    callbackSecret: 'k'.repeat(64),
    config,
  })
  assert.equal(spec.flavor, 't4-small')
  assert.equal(spec.timeoutSeconds, 1800)
  assert.match(spec.dockerImage, /pytorch/)
  assert.equal(spec.environment.HF_TOKEN, undefined)
  assert.equal(spec.secrets.HF_TOKEN, token)
  assert.match(spec.labels.purpose, /teacher-dataset/)
  assert.ok(spec.command.join(' ').includes('bitsandbytes'))
})

test('teacher job envelope rejects moving model refs, private Production data and missing buyer control', () => {
  const config = huggingFaceJobsConfigFromEnv(hfEnv())!
  const common = {
    callbackUrl: 'https://itmounts.com/api/internal/cos/university-distillation-teacher/evidence',
    idempotencyKey: 'teacher-key',
    callbackSecret: 'k'.repeat(64),
    config,
  }
  assert.throws(() => buildHuggingFaceJobSpec({
    ...common,
    envelope: { ...teacherEnvelope(), teacher: { modelId: 'Qwen/Qwen3-8B', revision: 'main', license: 'apache-2.0' } },
  }), /teacher_dataset_envelope_invalid/)
  assert.throws(() => buildHuggingFaceJobSpec({
    ...common,
    envelope: { ...teacherEnvelope(), containsPrivateProductionData: true },
  }), /teacher_dataset_envelope_invalid/)
  assert.throws(() => buildHuggingFaceJobSpec({
    ...common,
    envelope: { ...teacherEnvelope(), studentControlledByBuyer: false },
  }), /teacher_dataset_envelope_invalid/)
})

test('teacher callback binds case-exact model IDs and normalized immutable revisions', () => {
  const promptSetHash = '4'.repeat(64)
  const outputHashes = Array.from({ length: 20 }, (_, index) => index.toString(16).padStart(64, '0'))
  const evidence = {
    promptSetHash,
    teacherModelId: 'Qwen/Qwen3-8B',
    teacherModelRevision: teacherRevision,
    studentModelId: 'Qwen/Qwen3-4B',
    studentModelRevision: studentRevision,
    containsPrivateProductionData: false,
    studentControlledByBuyer: true,
    trainingRights: 'open_license',
  }
  const body = {
    sourceRef: `hf://datasets/cadomos/itmounts-teacher@${commit}#train`,
    teacherOutputItemHashes: outputHashes,
    promptSetHash,
    teacherModelId: 'Qwen/Qwen3-8B',
    teacherModelRevision: teacherRevision.toUpperCase(),
    studentModelId: 'Qwen/Qwen3-4B',
    studentModelRevision: studentRevision.toUpperCase(),
    containsPrivateProductionData: false,
    studentControlledByBuyer: true,
    trainingRights: 'open_license',
  }
  const valid = validateTeacherDatasetCallbackBinding(body, evidence)
  assert.equal(valid.eligible, true)
  const wrongCase = validateTeacherDatasetCallbackBinding({ ...body, teacherModelId: 'qwen/Qwen3-8B' }, evidence)
  assert.equal(wrongCase.eligible, false)
  assert.ok(wrongCase.blockers.includes('teacher_dataset_teacherModelId_mismatch'))
})

test('owner and internal routes preserve confirmation, signed callback, live price guard and dispatch kill switch', () => {
  const owner = readFileSync('app/api/admin/cos-university-training-executor/route.ts', 'utf8')
  const adapter = readFileSync('app/api/internal/cos/huggingface-training-executor/route.ts', 'utf8')
  const callback = readFileSync('app/api/internal/cos/university-distillation-teacher/evidence/route.ts', 'utf8')
  const worker = readFileSync('scripts/cos-university-hf-worker.py', 'utf8')
  assert.match(owner, /generate_teacher_dataset/)
  assert.match(owner, /requireExplicitTrainingDispatchConfirmation/)
  assert.match(adapter, /COS_UNIVERSITY_TRAINING_EXECUTOR_DISPATCH_ENABLED/)
  assert.match(adapter, /resolveHuggingFaceHardwareRate/)
  assert.match(adapter, /maxHourlyCostUsd/)
  assert.match(callback, /verifyTrainingExecutorPayload/)
  assert.match(worker, /generate_teacher_dataset/)
  assert.match(worker, /enable_thinking=False/)
  assert.match(worker, /strip_hidden_reasoning/)
  assert.match(worker, /private=True/)
})

test('no teacher dataset operation enables dispatch or auto-starts model training', () => {
  const owner = readFileSync('app/api/admin/cos-university-training-executor/route.ts', 'utf8')
  const module = readFileSync('lib/ai/cos/cosUniversityDistillationTeacherDataset.ts', 'utf8')
  assert.doesNotMatch(module, /COS_UNIVERSITY_TRAINING_EXECUTOR_DISPATCH_ENABLED\s*=/)
  assert.match(module, /requireExplicitTrainingDispatchConfirmation/)
  assert.match(module, /autoExecuteTraining:\s*false/)
  assert.doesNotMatch(owner, /confirmDispatch:\s*true/)
})
