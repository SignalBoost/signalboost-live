import test from 'node:test'
import assert from 'node:assert/strict'
import {
  desiredRunpodStartupContract,
  runpodStartupContractMatches,
} from '../lib/hub/runpodTelemetry.ts'

const previousModel = process.env.LOCAL_AI_MODEL
const previousEmbeddingModel = process.env.LOCAL_AI_EMBEDDING_MODEL

test.afterEach(() => {
  if (previousModel === undefined) delete process.env.LOCAL_AI_MODEL
  else process.env.LOCAL_AI_MODEL = previousModel
  if (previousEmbeddingModel === undefined) delete process.env.LOCAL_AI_EMBEDDING_MODEL
  else process.env.LOCAL_AI_EMBEDDING_MODEL = previousEmbeddingModel
})

test('RunPod startup contract launches the persistent COS bootstrap on every container start', () => {
  process.env.LOCAL_AI_MODEL = 'qwen2.5-coder:32b'
  process.env.LOCAL_AI_EMBEDDING_MODEL = 'nomic-embed-text'

  const contract = desiredRunpodStartupContract()
  assert.deepEqual(contract.dockerEntrypoint, ['bash', '-lc'])
  assert.equal(contract.dockerStartCmd.length, 1)
  assert.match(contract.dockerStartCmd[0], /\/workspace\/cos-runpod-reasoner\.sh/)
  assert.match(contract.dockerStartCmd[0], /\/workspace\/run-cos-reasoner\.sh/)
  assert.match(contract.dockerStartCmd[0], /qwen2\.5-coder:32b/)
  assert.match(contract.dockerStartCmd[0], /nomic-embed-text/)
  assert.match(contract.dockerStartCmd[0], /tail -f \/dev\/null/)
})

test('RunPod startup contract matcher rejects the old default-image boot configuration', () => {
  process.env.LOCAL_AI_MODEL = 'qwen2.5-coder:32b'
  process.env.LOCAL_AI_EMBEDDING_MODEL = 'nomic-embed-text'

  const desired = desiredRunpodStartupContract()
  assert.equal(runpodStartupContractMatches(desired), true)
  assert.equal(runpodStartupContractMatches({ dockerEntrypoint: [], dockerStartCmd: [] }), false)
  assert.equal(runpodStartupContractMatches({ dockerEntrypoint: desired.dockerEntrypoint, dockerStartCmd: ['sleep infinity'] }), false)
})

test('RunPod startup contract rejects shell metacharacters in model configuration', () => {
  process.env.LOCAL_AI_MODEL = 'qwen;rm -rf /'
  assert.throws(() => desiredRunpodStartupContract(), /unsupported shell characters/)
})
