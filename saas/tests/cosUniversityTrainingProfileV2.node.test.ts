import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const worker = readFileSync(new URL('../scripts/cos-university-hf-worker.py', import.meta.url), 'utf8')

test('training profile v3 increases learning capacity only for small datasets', () => {
  assert.match(worker, /TRAINING_PROFILE = "cos_university_small_batch_training_v3"/)
  assert.match(worker, /TRAINING_SMALL_MAX_ITEMS = 64/)
  assert.match(worker, /TRAINING_MEDIUM_MAX_ITEMS = 128/)
  assert.match(worker, /TRAINING_SMALL_EPOCHS = 4\.0/)
  assert.match(worker, /TRAINING_MEDIUM_EPOCHS = 2\.0/)
  assert.match(worker, /TRAINING_LARGE_EPOCHS = 1\.0/)
  assert.match(worker, /TRAINING_SMALL_GRADIENT_ACCUMULATION = 4/)
  assert.match(worker, /TRAINING_DEFAULT_GRADIENT_ACCUMULATION = 8/)
})

test('training profile v3 uses a lower small-batch learning rate and preserves bounded scheduler controls', () => {
  assert.match(worker, /TRAINING_SMALL_LEARNING_RATE = 7\.5e-5/)
  assert.match(worker, /TRAINING_DEFAULT_LEARNING_RATE = 1e-4/)
  assert.match(worker, /TRAINING_WARMUP_RATIO = 0\.10/)
  assert.match(worker, /TRAINING_LR_SCHEDULER = "cosine"/)
  assert.match(worker, /TRAINING_MAX_GRAD_NORM = 1\.0/)
})

test('v3 raises LoRA capacity only for small batches and leaves larger batches on v2 shape', () => {
  assert.match(worker, /TRAINING_SMALL_LORA_R = 32/)
  assert.match(worker, /TRAINING_SMALL_LORA_ALPHA = 64/)
  assert.match(worker, /TRAINING_DEFAULT_LORA_R = 16/)
  assert.match(worker, /TRAINING_DEFAULT_LORA_ALPHA = 32/)
  assert.match(worker, /TRAINING_LORA_DROPOUT = 0\.05/)
  assert.match(worker, /"targetModules": "all-linear"/)
})

test('v3 pins and validates the proven v2 worker instead of changing teacher or preparation behavior', () => {
  assert.match(worker, /V2_WORKER_COMMIT = "46e7c753380f926a994dad07534e8f2a4273e739"/)
  assert.match(worker, /worker_v2_contract_invalid/)
  assert.match(worker, /v2\._training_recipe = _training_recipe/)
  assert.match(worker, /v2\.TRAINING_PROFILE = TRAINING_PROFILE/)
})

test('recipe hardening does not contain provider spend or promotion authority', () => {
  assert.doesNotMatch(worker, /reservedCostCeilingUsd|automaticPromotionAuthorized|maxHourlyCostUsd|trainingTimeoutSeconds/)
})
