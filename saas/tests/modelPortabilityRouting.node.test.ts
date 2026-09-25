import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveModelRuntimeBinding } from '../lib/ai/local-inference.ts'

function withBuyerRegistry(value: string | undefined, run: () => void): void {
  const previous = process.env.ITMOUNTS_MODEL_REGISTRY_JSON
  try {
    if (value === undefined) delete process.env.ITMOUNTS_MODEL_REGISTRY_JSON
    else process.env.ITMOUNTS_MODEL_REGISTRY_JSON = value
    run()
  } finally {
    if (previous === undefined) delete process.env.ITMOUNTS_MODEL_REGISTRY_JSON
    else process.env.ITMOUNTS_MODEL_REGISTRY_JSON = previous
  }
}

test('registered OpenAI-compatible runtime binds to the platform model profile', () => {
  withBuyerRegistry(undefined, () => {
    const binding = resolveModelRuntimeBinding('Qwen/Qwen3-4B')
    assert.equal(binding.registered, true)
    assert.equal(binding.profileKey, 'qwen3-4b-university-student-v1')
    assert.equal(binding.transportProtocol, 'openai_compatible')
  })
})

test('legacy runtime remains available during migration unless strict registration is enabled', () => {
  withBuyerRegistry(undefined, () => {
    const binding = resolveModelRuntimeBinding('buyer/runtime-not-yet-registered')
    assert.equal(binding.registered, false)
    assert.equal(binding.profileKey, null)
    assert.equal(binding.transportProtocol, 'legacy_openai_compatible')
    assert.throws(
      () => resolveModelRuntimeBinding('buyer/runtime-not-yet-registered', { requireRegistered: true }),
      /platform_runtime_model_not_registered/,
    )
  })
})

test('buyer-registered OpenAI-compatible model can enter the existing live inference seam', () => {
  withBuyerRegistry(JSON.stringify([{
    key: 'buyer-live-reasoner-v1',
    family: 'buyer',
    modelId: 'buyer/live-reasoner',
    revisionPolicy: 'runtime_owned',
    uses: ['cos_reasoner', 'builder', 'specialist'],
    transportProtocols: ['openai_compatible'],
    inference: { chatCompletion: 'validated', structuredJson: 'validated', toolCalling: 'validated' },
    training: {},
  }]), () => {
    const binding = resolveModelRuntimeBinding('buyer/live-reasoner', { requireRegistered: true })
    assert.equal(binding.registered, true)
    assert.equal(binding.profileKey, 'buyer-live-reasoner-v1')
    assert.equal(binding.transportProtocol, 'openai_compatible')
  })
})

test('registered non-OpenAI transport cannot be silently sent to chat/completions', () => {
  withBuyerRegistry(JSON.stringify([{
    key: 'buyer-anthropic-wire-v1',
    family: 'buyer',
    modelId: 'buyer/anthropic-wire',
    revisionPolicy: 'runtime_owned',
    uses: ['cos_reasoner'],
    transportProtocols: ['anthropic_messages'],
    inference: { chatCompletion: 'validated' },
    training: {},
  }]), () => {
    assert.throws(
      () => resolveModelRuntimeBinding('buyer/anthropic-wire', { requireRegistered: true }),
      /platform_model_transport_not_supported_by_local_inference/,
    )
  })
})

test('registered model with unvalidated chat capability fails closed', () => {
  withBuyerRegistry(JSON.stringify([{
    key: 'buyer-unvalidated-chat-v1',
    family: 'buyer',
    modelId: 'buyer/no-chat-yet',
    revisionPolicy: 'runtime_owned',
    uses: ['specialist'],
    transportProtocols: ['openai_compatible'],
    inference: { chatCompletion: 'experimental' },
    training: {},
  }]), () => {
    assert.throws(
      () => resolveModelRuntimeBinding('buyer/no-chat-yet'),
      /platform_model_capability_not_validated:inference:chatCompletion:experimental/,
    )
  })
})
