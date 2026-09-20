import test from 'node:test'
import assert from 'node:assert/strict'
import {
  desiredRunpodStartupContract,
  runpodGatewayKey,
  runpodStartupContractMatches,
} from '../lib/hub/runpodTelemetry.ts'

const previous = {
  apiKey: process.env.RUNPOD_API_KEY,
  podId: process.env.RUNPOD_PRIMARY_POD_ID,
  model: process.env.RUNPOD_PRIMARY_MODEL,
  embeddingModel: process.env.RUNPOD_PRIMARY_EMBEDDING_MODEL,
  publicOrigin: process.env.ITMOUNTS_PUBLIC_ORIGIN,
}

test.afterEach(() => {
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  restore('RUNPOD_API_KEY', previous.apiKey)
  restore('RUNPOD_PRIMARY_POD_ID', previous.podId)
  restore('RUNPOD_PRIMARY_MODEL', previous.model)
  restore('RUNPOD_PRIMARY_EMBEDDING_MODEL', previous.embeddingModel)
  restore('ITMOUNTS_PUBLIC_ORIGIN', previous.publicOrigin)
})

function configure() {
  process.env.RUNPOD_API_KEY = 'TEST_RUNPOD_CONTROL_KEY_NOT_REAL'
  process.env.RUNPOD_PRIMARY_POD_ID = 'primary123'
  process.env.RUNPOD_PRIMARY_MODEL = 'qwen3:30b'
  process.env.RUNPOD_PRIMARY_EMBEDDING_MODEL = 'nomic-embed-text'
  process.env.ITMOUNTS_PUBLIC_ORIGIN = 'https://itmounts.com'
}

test('RunPod startup contract uses authenticated iTMounts bootstrap delivery and starts the primary models', () => {
  configure()
  const contract = desiredRunpodStartupContract()
  assert.deepEqual(contract.dockerEntrypoint, ['bash', '-lc'])
  assert.equal(contract.dockerStartCmd.length, 1)
  assert.match(contract.dockerStartCmd[0], /https:\/\/itmounts\.com\/api\/internal\/cos\/runpod-bootstrap\/[a-f0-9]{64}\/runpod-cos-reasoner\.sh/)
  assert.doesNotMatch(contract.dockerStartCmd[0], /raw\.githubusercontent\.com/)
  assert.doesNotMatch(contract.dockerStartCmd[0], /github\.com\/SignalBoost\/signalboost-live/)
  assert.match(contract.dockerStartCmd[0], /qwen3:30b/)
  assert.match(contract.dockerStartCmd[0], /nomic-embed-text/)
  assert.match(contract.dockerStartCmd[0], /\/workspace\/cos-api-key/)
  assert.match(contract.dockerStartCmd[0], /tail -f \/dev\/null/)
})

test('inference gateway key is derived and never equals the RunPod account key', () => {
  configure()
  const derived = runpodGatewayKey()
  assert.equal(derived.length, 64)
  assert.notEqual(derived, process.env.RUNPOD_API_KEY)
  const contract = desiredRunpodStartupContract()
  assert.equal(contract.dockerStartCmd[0].includes(String(process.env.RUNPOD_API_KEY)), false)
  assert.equal(contract.dockerStartCmd[0].includes(derived), true)
})

test('RunPod startup contract matcher rejects stale or default-image boot configuration', () => {
  configure()
  const desired = desiredRunpodStartupContract()
  assert.equal(runpodStartupContractMatches(desired), true)
  assert.equal(runpodStartupContractMatches({ dockerEntrypoint: [], dockerStartCmd: [] }), false)
  assert.equal(runpodStartupContractMatches({ dockerEntrypoint: desired.dockerEntrypoint, dockerStartCmd: ['sleep infinity'] }), false)
})

test('RunPod startup contract rejects shell metacharacters in primary model configuration', () => {
  configure()
  process.env.RUNPOD_PRIMARY_MODEL = 'qwen;rm -rf /'
  assert.throws(() => desiredRunpodStartupContract(), /unsupported shell characters/)
})


test('RunPod bootstrap delivery token is derived and never exposes the RunPod account key', async () => {
  configure()
  const delivery = await import('../lib/ai/cos/runpodBootstrapDelivery.ts')
  const token = delivery.deriveRunpodBootstrapDeliveryToken(String(process.env.RUNPOD_API_KEY))
  assert.equal(token.length, 64)
  assert.notEqual(token, process.env.RUNPOD_API_KEY)
  const url = delivery.runpodBootstrapDeliveryUrl(process.env)
  assert.match(String(url), /^https:\/\/itmounts\.com\/api\/internal\/cos\/runpod-bootstrap\/[a-f0-9]{64}\/runpod-cos-reasoner\.sh$/)
  assert.equal(String(url).includes(String(process.env.RUNPOD_API_KEY)), false)
})
