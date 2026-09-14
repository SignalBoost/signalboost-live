import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const ROOT = path.resolve(import.meta.dirname, '..')
const worker = fs.readFileSync(path.join(ROOT, 'scripts/cos-university-hf-worker.py'), 'utf8')
const base = fs.readFileSync(path.join(ROOT, 'scripts/cos-university-hf-worker-base.py'), 'utf8')

test('teacher generation uses bounded micro-batches with adaptive OOM splitting', () => {
  assert.match(worker, /TEACHER_BATCH_SIZE = 4/)
  assert.match(worker, /tokenizer\.padding_side = "left"/)
  assert.match(worker, /return_tensors="pt", padding=True/)
  assert.match(worker, /"out of memory" not in str\(exc\)\.lower\(\)/)
  assert.match(worker, /midpoint = max\(1, len\(items\) \/\/ 2\)/)
  assert.match(worker, /torch\.cuda\.empty_cache\(\)/)
})

test('teacher generation retries only terse answers once without lowering quality gates', () => {
  assert.match(worker, /TEACHER_MIN_RESPONSE_CHARS = 80/)
  assert.match(worker, /TEACHER_MIN_DATASET_ITEMS = 20/)
  assert.match(worker, /TEACHER_MAX_NEW_TOKENS = 384/)
  assert.match(worker, /TEACHER_RETRY_MAX_NEW_TOKENS = 512/)
  assert.match(worker, /if len\(answer\) < TEACHER_MIN_RESPONSE_CHARS/)
  assert.match(worker, /previous response to this case was too terse/)
  assert.match(worker, /if len\(rows\) < TEACHER_MIN_DATASET_ITEMS/)
  assert.match(worker, /worker_teacher_dataset_too_small/)
})

test('teacher retry remains deterministic and never requests hidden reasoning', () => {
  assert.match(worker, /do_sample=False/)
  assert.match(worker, /enable_thinking=False/)
  assert.match(worker, /Never reveal hidden chain-of-thought or internal scratch work/)
  assert.match(worker, /at least two substantive sentences/)
})

test('wrapper preserves the proven preparation and training implementation unchanged', () => {
  assert.match(worker, /BASE_WORKER_FILENAME = "cos-university-hf-worker-base\.py"/)
  assert.match(worker, /base\.generate_teacher_dataset = lambda envelope: generate_teacher_dataset\(base, envelope\)/)
  assert.match(base, /def prepare_dataset\(envelope:/)
  assert.match(base, /def train\(envelope:/)
  assert.match(base, /worker_teacher_dataset_too_small/)
})

test('teacher throughput repair does not encode provider budget or timeout expansion', () => {
  assert.doesNotMatch(worker, /teacherTimeoutSeconds|maxHourlyCostUsd|reservedCostCeilingUsd|1\.61|9\.125/)
})
