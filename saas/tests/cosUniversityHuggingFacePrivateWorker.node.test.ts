import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  createHuggingFaceWorkerAccessToken,
  createHuggingFaceWorkerUrl,
  verifyHuggingFaceWorkerAccessToken,
} from '../lib/ai/cos/cosUniversityHuggingFaceWorkerAccess.ts'

const route = readFileSync(new URL('../app/api/internal/cos/huggingface-worker/[token]/[filename]/route.ts', import.meta.url), 'utf8')
const executor = readFileSync(new URL('../app/api/internal/cos/huggingface-training-executor/route.ts', import.meta.url), 'utf8')
const nextConfig = readFileSync(new URL('../next.config.mjs', import.meta.url), 'utf8')

const SECRET = 's'.repeat(64)

test('worker capability is short-lived, signed and filename scoped', () => {
  const now = new Date('2026-09-17T13:20:00Z')
  const token = createHuggingFaceWorkerAccessToken({ secret: SECRET, now })
  assert.equal(verifyHuggingFaceWorkerAccessToken({ token, secret: SECRET, now }), true)
  assert.equal(verifyHuggingFaceWorkerAccessToken({ token, secret: SECRET, now: new Date('2026-09-17T13:36:00Z') }), false)
  assert.equal(verifyHuggingFaceWorkerAccessToken({ token, secret: 'x'.repeat(64), now }), false)
  const url = createHuggingFaceWorkerUrl({ origin: 'https://itmounts.com', secret: SECRET, now })
  assert.match(url, /^https:\/\/itmounts\.com\/api\/internal\/cos\/huggingface-worker\/\d{10}\.[a-f0-9]{64}\/cos-university-hf-worker\.py$/)
})

test('private worker route exposes only traced worker files after capability verification', () => {
  assert.match(route, /verifyHuggingFaceWorkerAccessToken/)
  assert.match(route, /allowedHuggingFaceWorkerFilename/)
  assert.match(route, /cos-university-hf-worker\.py/)
  assert.match(route, /cos-university-hf-worker-base\.py/)
  assert.match(route, /cache-control': 'private, no-store, max-age=0'/)
  assert.match(nextConfig, /huggingface-worker\/\[token\]\/\[filename\]/)
  assert.match(nextConfig, /scripts\/cos-university-hf-worker-base\.py/)
})

test('training executor refreshes a signed worker URL per submission without widening authority', () => {
  assert.match(executor, /createHuggingFaceWorkerUrl/)
  assert.match(executor, /huggingFaceJobsConfigFromEnv\(\{ \.\.\.process\.env, COS_UNIVERSITY_HF_WORKER_URL: workerUrl \}\)/)
  assert.doesNotMatch(executor, /process\.env\.COS_UNIVERSITY_HF_WORKER_URL\s*=/)
  assert.match(executor, /COS_UNIVERSITY_TRAINING_EXECUTOR_DISPATCH_ENABLED !== 'true'/)
  assert.match(executor, /resolveHuggingFaceHardwareRate/)
})
