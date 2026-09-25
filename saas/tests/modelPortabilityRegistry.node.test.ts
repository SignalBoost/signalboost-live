import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CURRENT_UNIVERSITY_STUDENT_PROFILE,
  parseBuyerModelProfiles,
  requireModelCapability,
} from '../lib/ai/modelCapabilityRegistry.ts'
import { requireTransportForProfile, type ModelTransportAdapter } from '../lib/ai/modelTransportAdapter.ts'

test('current University student is a registry profile rather than a platform assumption', () => {
  assert.equal(CURRENT_UNIVERSITY_STUDENT_PROFILE.modelId, 'Qwen/Qwen3-4B')
  assert.equal(CURRENT_UNIVERSITY_STUDENT_PROFILE.family, 'qwen3')
  assert.equal(CURRENT_UNIVERSITY_STUDENT_PROFILE.inference.vllm, 'validated')
  assert.equal(CURRENT_UNIVERSITY_STUDENT_PROFILE.inference.xsa, 'blocked')
  assert.equal(CURRENT_UNIVERSITY_STUDENT_PROFILE.inference.speculativeDecoding, 'not_validated')
})

test('buyer can register a non-OpenAI model and custom transport without changing product code', () => {
  const [profile] = parseBuyerModelProfiles(JSON.stringify([{
    key: 'buyer-private-reasoner-v1',
    family: 'buyer_private',
    modelId: 'buyer/private-reasoner',
    providerModelId: 'reasoner-v1',
    revision: 'release-2026-09-25',
    revisionPolicy: 'fixed',
    tokenizerModelId: 'buyer/private-tokenizer',
    uses: ['cos_reasoner', 'builder', 'specialist'],
    transportProtocols: ['custom_http'],
    inference: { chatCompletion: 'validated', structuredJson: 'validated', toolCalling: 'validated' },
    training: {},
  }]))
  assert.equal(profile.modelId, 'buyer/private-reasoner')
  assert.deepEqual(profile.transportProtocols, ['custom_http'])
  assert.equal(profile.inference.chatCompletion, 'validated')
  assert.equal(profile.inference.vllm, 'not_validated')
  assert.equal(profile.training.qlora, 'not_validated')
})

test('declaring a profile does not grant unvalidated capabilities', () => {
  const [profile] = parseBuyerModelProfiles(JSON.stringify([{
    key: 'buyer-anthropic-shape-v1',
    family: 'buyer',
    modelId: 'buyer/reasoner-2',
    revisionPolicy: 'runtime_owned',
    uses: ['cos_reasoner'],
    transportProtocols: ['anthropic_messages'],
    inference: { chatCompletion: 'validated' },
    training: {},
  }]))
  assert.throws(() => requireModelCapability(profile, 'inference', 'toolCalling'), /platform_model_capability_not_validated/)
})

test('transport selection is protocol-neutral and fails closed without an installed adapter', async () => {
  const [profile] = parseBuyerModelProfiles(JSON.stringify([{
    key: 'buyer-google-shape-v1',
    family: 'buyer',
    modelId: 'buyer/reasoner-3',
    revisionPolicy: 'runtime_owned',
    uses: ['specialist'],
    transportProtocols: ['google_generate_content'],
    inference: { chatCompletion: 'validated' },
    training: {},
  }]))
  assert.throws(() => requireTransportForProfile(profile, []), /platform_model_transport_unavailable/)
  const adapter: ModelTransportAdapter = {
    id: 'test-google',
    protocol: 'google_generate_content',
    supports: candidate => candidate.modelId === profile.modelId,
    health: async candidate => ({ ok: true, provider: 'test', model: candidate.modelId, error: null }),
    chat: async request => ({ text: 'ok', toolCalls: [], finishReason: 'stop', provider: 'test', model: request.profile.modelId }),
  }
  assert.equal(requireTransportForProfile(profile, [adapter]).id, 'test-google')
})

test('invalid or duplicate buyer profiles fail closed', () => {
  assert.throws(() => parseBuyerModelProfiles('{'), /platform_model_registry_json_invalid/)
  assert.throws(() => parseBuyerModelProfiles(JSON.stringify([{
    key: 'bad-fixed-v1', family: 'buyer', modelId: 'buyer/bad', revisionPolicy: 'fixed',
    uses: ['cos_reasoner'], transportProtocols: ['custom_http'], inference: {}, training: {},
  }])), /platform_model_profile_fixed_revision_required/)
  assert.throws(() => parseBuyerModelProfiles(JSON.stringify([{
    key: 'bad-transport-v1', family: 'buyer', modelId: 'buyer/bad2', revisionPolicy: 'runtime_owned',
    uses: ['cos_reasoner'], transportProtocols: ['magic_vendor_protocol'], inference: {}, training: {},
  }])), /platform_model_profile_transport_invalid/)
})
