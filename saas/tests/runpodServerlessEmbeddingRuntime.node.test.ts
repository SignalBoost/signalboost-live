import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const worker = readFileSync(new URL('../../runpod/serverless-embedding/app.py', import.meta.url), 'utf8')
const dockerfile = readFileSync(new URL('../../runpod/serverless-embedding/Dockerfile', import.meta.url), 'utf8')
const provision = readFileSync(new URL('../lib/ai/cos/runpodServerlessEmbeddingProvision.ts', import.meta.url), 'utf8')
const provisionRoute = readFileSync(new URL('../app/api/cron/runpod-serverless-embedding-provision/route.ts', import.meta.url), 'utf8')
const probe = readFileSync(new URL('../app/api/cron/runpod-primary-probe/route.ts', import.meta.url), 'utf8')
const workflow = readFileSync(new URL('../../.github/workflows/runpod-serverless-embedding.yml', import.meta.url), 'utf8')

test('serverless worker exposes RunPod health and OpenAI embedding routes', () => {
  assert.match(worker, /@app\.get\("\/ping"\)/)
  assert.match(worker, /@app\.post\("\/v1\/embeddings"\)/)
  assert.match(worker, /request\.model != MODEL_ID/)
  assert.match(worker, /normalize_embeddings=True/)
})

test('worker image pre-caches the current managed BGE family default', () => {
  assert.match(dockerfile, /BAAI\/bge-base-en-v1\.5/)
  assert.match(dockerfile, /EMBEDDING_MODEL_CACHE=\/models\/cache/)
  assert.match(dockerfile, /EXPOSE 8000/)
})

test('provisioning inherits the exact live Production embedding model', () => {
  assert.match(provision, /process\.env\.LOCAL_AI_EMBEDDING_MODEL/)
  assert.match(provision, /EMBEDDING_MODEL: model/)
  assert.match(provision, /ghcr\.io\/signalboost\/itmounts-embedding-serverless:latest/)
})

test('serverless endpoint is scale-to-zero, five-second idle, and bounded to one worker', () => {
  assert.match(provision, /workersMin: 0/)
  assert.match(provision, /workersMax: 1/)
  assert.match(provision, /flashboot: true/)
  assert.match(provision, /idleTimeout: 5/)
  assert.match(provision, /NVIDIA RTX A4000/)
  assert.match(provision, /NVIDIA RTX A4500/)
  assert.match(provision, /NVIDIA RTX 4000 Ada Generation/)
})

test('every-minute RunPod probe remains read-only', () => {
  assert.doesNotMatch(probe, /provisionRunpodServerlessEmbedding/)
  assert.doesNotMatch(probe, /method:\s*['"]POST['"]/)
  assert.doesNotMatch(probe, /RUNPOD_API_KEY.*console|console.*RUNPOD_API_KEY/)
})

test('serverless provisioning requires an explicit disabled-by-default latch', () => {
  assert.match(provisionRoute, /RUNPOD_SERVERLESS_EMBEDDING_PROVISION_ENABLED/)
  assert.match(provisionRoute, /explicit_provisioning_latch_disabled/)
  const latch = provisionRoute.indexOf('if (!provisioningEnabled())')
  const mutate = provisionRoute.indexOf('await provisionRunpodServerlessEmbedding()')
  assert.ok(latch >= 0 && mutate > latch)
})

test('GitHub Actions publishes the worker image from main', () => {
  assert.match(workflow, /packages: write/)
  assert.match(workflow, /ghcr\.io\/signalboost\/itmounts-embedding-serverless:latest/)
  assert.match(workflow, /docker\/build-push-action@v6/)
})
