import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runpodModelLeaseMissionId } from '../lib/ai/cos/runpodInferenceLease.ts'

test('COS and Builder acquire distinct durable lease rows', () => {
  const reasoner = runpodModelLeaseMissionId('qwen3:30b')
  const builder = runpodModelLeaseMissionId('qwen3-coder:30b')
  assert.notEqual(reasoner, builder)
  assert.equal(runpodModelLeaseMissionId('qwen3:30b'), reasoner, 'same model shares the same queue')
  assert.equal(runpodModelLeaseMissionId(' qwen3:30b '), reasoner)
})

test('invalid model names cannot select arbitrary database keys', () => {
  for (const model of ['', ' ', '../bad name', 'bad\nname']) {
    assert.throws(() => runpodModelLeaseMissionId(model), /runpod_invalid_lease_model/)
  }
})

test('all inference paths bind leases to the requested model and release only that row', () => {
  const lease = readFileSync(new URL('../lib/ai/cos/runpodInferenceLease.ts', import.meta.url), 'utf8')
  const primary = readFileSync(new URL('../lib/ai/cos/runpodPrimaryInference.ts', import.meta.url), 'utf8')
  const chat = readFileSync(new URL('../lib/ai/local-inference.ts', import.meta.url), 'utf8')
  assert.match(lease, /const missionId = runpodModelLeaseMissionId\(model\)/)
  assert.match(lease, /const missionId = lease\.missionId/)
  assert.match(primary, /acquireRunpodInferenceLease\(config\.timeoutMs, config\.model, args\.signal\)/)
  assert.match(chat, /tryAcquireRunpodInferenceLeaseNow\(runpodConfig\.timeoutMs, runpodConfig\.model\)/)
})
