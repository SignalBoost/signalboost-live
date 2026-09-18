// saas/tests/cosUniversityTrainingProfileV2.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const worker = readFileSync(new URL('../scripts/cos-university-hf-worker.py', import.meta.url), 'utf8')

test('training profile v2 increases optimizer exposure only for small datasets', () => {
  assert.match(worker, /TRAINING_PROFILE = "cos_university_small_batch_training_v2"/)
  assert.match(worker, /TRAINING_SMALL_MAX_ITEMS = 64/)
  assert.match(worker, /TRAINING_MEDIUM_MAX_ITEMS = 128/)
  assert.match(worker, /TRAINING_SMALL_EPOCHS = 3\.0/)
  assert.match(worker, /TRAINING_MEDIUM_EPOCHS = 2\.0/)
  assert.match(worker, /TRAINING_LARGE_EPOCHS = 1\.0/)
  assert.match(worker, /TRAINING_SMALL_GRADIENT_ACCUMULATION = 4/)
  assert.match(worker, /TRAINING_DEFAULT_GRADIENT_ACCUMULATION = 8/)
})

test('training profile v2 lowers learning rate and adds bounded scheduler controls', () => {
  assert.match(worker, /TRAINING_LEARNING_RATE = 1e-4/)
  assert.match(worker, /TRAINING_WARMUP_RATIO = 0\.10/)
  assert.match(worker, /TRAINING_LR_SCHEDULER = "cosine"/)
  assert.match(worker, /TRAINING_MAX_GRAD_NORM = 1\.0/)
  assert.match(worker, /\*\*_warmup_arguments\(SFTConfig, recipe\)/)
  assert.match(worker, /if "warmup_ratio" in parameters:\n\s+return \{"warmup_ratio": ratio\}/)
  assert.match(worker, /return \{"warmup_steps": max\(1, math\.ceil\(total_steps \* ratio\)\) if ratio > 0 else 0\}/)
  assert.match(worker, /lr_scheduler_type=recipe\["lrSchedulerType"\]/)
  assert.match(worker, /max_grad_norm=recipe\["maxGradNorm"\]/)
})

test('v2 preserves the proven LoRA shape so the experiment isolates optimizer exposure', () => {
  assert.match(worker, /"loraR": 16/)
  assert.match(worker, /"loraAlpha": 32/)
  assert.match(worker, /"loraDropout": 0\.05/)
  assert.match(worker, /"targetModules": "all-linear"/)
})

test('the exact training recipe becomes immutable artifact evidence', () => {
  assert.match(worker, /itmounts_training_profile\.json/)
  assert.match(worker, /profile_path\.write_text/)
  assert.match(worker, /artifact_hash = base\.directory_hash\(output_dir\)/)
  assert.ok(worker.indexOf('profile_path.write_text') < worker.indexOf('artifact_hash = base.directory_hash(output_dir)'))
  assert.match(worker, /"trainingProfile": TRAINING_PROFILE/)
  assert.match(worker, /"trainingRecipe": recipe/)
})

test('recipe hardening does not contain provider spend or promotion authority', () => {
  assert.doesNotMatch(worker, /reservedCostCeilingUsd|automaticPromotionAuthorized|maxHourlyCostUsd|trainingTimeoutSeconds/)
})
