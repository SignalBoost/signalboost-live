import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildWorkingCosRuntimeBinding,
  normalizeOllamaDigest,
  queryWorkingCosRuntimeIdentity,
  workingCosRuntimeBindingFromEnv,
} from '../lib/ai/cos/cosWorkingRuntimeBinding.ts'

const DIGEST = 'a'.repeat(64)
const REVISION = 'b'.repeat(40)

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body },
  } as Response
}

test('runtime identity reads exact Ollama digest from authenticated gateway', async () => {
  let requested = ''
  let auth = ''
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    requested = String(url)
    const headers = init?.headers as Record<string, string>
    auth = headers?.['x-api-key'] || ''
    return response({
      models: [{
        name: 'qwen3:30b',
        model: 'qwen3:30b',
        digest: DIGEST,
        modified_at: '2026-09-23T20:00:00Z',
        size: 18_000_000_000,
        details: { family: 'qwen3moe', parameter_size: '30.5B', quantization_level: 'Q4_K_M' },
      }],
    })
  }) as typeof fetch

  const identity = await queryWorkingCosRuntimeIdentity({
    baseUrl: 'https://pod-11434.proxy.runpod.net/v1',
    model: 'qwen3:30b',
    apiKey: 'test-key',
    timeoutMs: 5000,
  }, fetcher)

  assert.equal(requested, 'https://pod-11434.proxy.runpod.net/api/tags')
  assert.equal(auth, 'test-key')
  assert.equal(identity.ready, true)
  assert.equal(identity.model, 'qwen3:30b')
  assert.equal(identity.digest, DIGEST)
  assert.equal(identity.family, 'qwen3moe')
  assert.equal(identity.parameterSize, '30.5B')
  assert.equal(identity.quantizationLevel, 'Q4_K_M')
})

test('runtime binding requires explicit digest-to-pinned-base declaration', () => {
  const binding = buildWorkingCosRuntimeBinding({
    runtimeReady: true,
    podId: 'pod123',
    configuredRuntimeModel: 'qwen3:30b',
    observedRuntimeModel: 'qwen3:30b',
    observedRuntimeDigest: DIGEST,
    declaredRuntimeDigest: '',
    trainableBaseModelId: 'Qwen/Qwen3-30B-A3B',
    trainableBaseModelRevision: REVISION,
  })

  assert.equal(binding.eligible, false)
  assert.ok(binding.blockers.includes('declared_runtime_digest_invalid'))
  assert.equal(binding.trainingDispatchAuthorized, false)
  assert.equal(binding.productionTrafficAuthorized, false)
})

test('runtime binding proves immutable baseline and pinned trainable base without authorizing training', () => {
  const binding = buildWorkingCosRuntimeBinding({
    runtimeReady: true,
    podId: 'pod123',
    configuredRuntimeModel: 'qwen3:30b',
    observedRuntimeModel: 'qwen3:30b',
    observedRuntimeDigest: `sha256:${DIGEST}`,
    declaredRuntimeDigest: DIGEST,
    trainableBaseModelId: 'Qwen/Qwen3-30B-A3B',
    trainableBaseModelRevision: REVISION,
  })

  assert.equal(binding.eligible, true)
  assert.match(String(binding.bindingKey), /^[a-f0-9]{64}$/)
  assert.equal(binding.baselineIdentity, `runpod:pod123:ollama:qwen3:30b@sha256:${DIGEST}`)
  assert.equal(binding.trainableBaseRef, `hf://models/Qwen/Qwen3-30B-A3B@${REVISION}`)
  assert.match(String(binding.rollbackArtifactRef), new RegExp(DIGEST))
  assert.equal(binding.currentRuntimeMutationAuthorized, false)
  assert.equal(binding.trainingDispatchAuthorized, false)
  assert.equal(binding.nextGate, 'balanced_bundle_partition_and_bounded_training_dispatch')
})

test('runtime binding fails closed on alias or digest mismatch', () => {
  const aliasMismatch = buildWorkingCosRuntimeBinding({
    runtimeReady: true,
    podId: 'pod123',
    configuredRuntimeModel: 'qwen3:30b',
    observedRuntimeModel: 'qwen2.5-coder:32b',
    observedRuntimeDigest: DIGEST,
    declaredRuntimeDigest: DIGEST,
    trainableBaseModelId: 'Qwen/Qwen3-30B-A3B',
    trainableBaseModelRevision: REVISION,
  })
  assert.ok(aliasMismatch.blockers.includes('runtime_model_mismatch'))

  const digestMismatch = buildWorkingCosRuntimeBinding({
    runtimeReady: true,
    podId: 'pod123',
    configuredRuntimeModel: 'qwen3:30b',
    observedRuntimeModel: 'qwen3:30b',
    observedRuntimeDigest: DIGEST,
    declaredRuntimeDigest: 'c'.repeat(64),
    trainableBaseModelId: 'Qwen/Qwen3-30B-A3B',
    trainableBaseModelRevision: REVISION,
  })
  assert.ok(digestMismatch.blockers.includes('runtime_digest_binding_mismatch'))
})

test('environment binding is blocked until all three operator declarations exist', () => {
  const identity = {
    ready: true,
    model: 'qwen3:30b',
    digest: DIGEST,
    modifiedAt: null,
    size: null,
    family: 'qwen3moe',
    parameterSize: '30.5B',
    quantizationLevel: 'Q4_K_M',
  } as const

  const blocked = workingCosRuntimeBindingFromEnv(identity, 'pod123', 'qwen3:30b', {})
  assert.equal(blocked.eligible, false)

  const eligible = workingCosRuntimeBindingFromEnv(identity, 'pod123', 'qwen3:30b', {
    COS_WORKING_DISTILLATION_RUNTIME_DIGEST: DIGEST,
    COS_WORKING_DISTILLATION_BASE_MODEL_ID: 'Qwen/Qwen3-30B-A3B',
    COS_WORKING_DISTILLATION_BASE_MODEL_REVISION: REVISION,
  })
  assert.equal(eligible.eligible, true)
})

test('Ollama digest normalization accepts optional sha256 prefix only', () => {
  assert.equal(normalizeOllamaDigest(DIGEST), DIGEST)
  assert.equal(normalizeOllamaDigest(`sha256:${DIGEST}`), DIGEST)
  assert.equal(normalizeOllamaDigest('not-a-digest'), null)
})


test('RunPod primary probe exposes digest/binding evidence without making it a repair trigger', () => {
  const route = readFileSync(new URL('../app/api/cron/runpod-primary-probe/route.ts', import.meta.url), 'utf8')
  const env = readFileSync(new URL('../.env.example', import.meta.url), 'utf8')
  assert.match(route, /queryWorkingCosRuntimeIdentity\(inferenceConfig\)/)
  assert.match(route, /inferenceDigest:\s*runtimeIdentity\.digest/)
  assert.match(route, /workingCosRuntimeBinding:\s*workingCosRuntimeBindingFromEnv/)
  assert.match(route, /runtimeIdentityError/)
  assert.doesNotMatch(route, /hardServingFailure[\s\S]{0,300}runtimeIdentityError/)
  assert.match(env, /COS_WORKING_DISTILLATION_RUNTIME_DIGEST=/)
  assert.match(env, /Known qwen3:30b mapping: Qwen\/Qwen3-30B-A3B-Thinking-2507/)
  assert.match(env, /144afc2f379b542fdd4e85a1fcd5e1f79112d95d/)
  assert.match(env, /COS_WORKING_DISTILLATION_BASE_MODEL_ID=\n/)
  assert.match(env, /COS_WORKING_DISTILLATION_BASE_MODEL_REVISION=\n/)
})


test('known Production qwen3 digest binds automatically to the pinned Thinking-2507 base', () => {
  const productionDigest = 'ad815644918f0eaab341c12b67837cc6dd4562342cdaf118f83d5d554cb37226'
  const identity = {
    ready: true,
    model: 'qwen3:30b',
    digest: productionDigest,
    modifiedAt: '2026-09-14T01:35:28Z',
    size: 18556699314,
    family: 'qwen3moe',
    parameterSize: '30.5B',
    quantizationLevel: 'Q4_K_M',
  } as const
  const binding = workingCosRuntimeBindingFromEnv(identity, 'yvj6e9zboi7ofo', 'qwen3:30b', {})

  assert.equal(binding.eligible, true)
  assert.equal(binding.bindingSource, 'versioned_exact_digest_allowlist')
  assert.equal(binding.knownRuntimeSource, 'ollama_qwen3_30b_thinking_2507_q4_k_m')
  assert.equal(binding.observedRuntimeDigest, productionDigest)
  assert.equal(binding.trainableBaseModelId, 'Qwen/Qwen3-30B-A3B-Thinking-2507')
  assert.equal(binding.trainableBaseModelRevision, '144afc2f379b542fdd4e85a1fcd5e1f79112d95d')
  assert.equal(binding.trainingDispatchAuthorized, false)
  assert.equal(binding.productionTrafficAuthorized, false)
})

test('any partial operator override disables known-digest fallback and fails closed', () => {
  const productionDigest = 'ad815644918f0eaab341c12b67837cc6dd4562342cdaf118f83d5d554cb37226'
  const identity = {
    ready: true,
    model: 'qwen3:30b',
    digest: productionDigest,
    modifiedAt: null,
    size: null,
    family: 'qwen3moe',
    parameterSize: '30.5B',
    quantizationLevel: 'Q4_K_M',
  } as const
  const binding = workingCosRuntimeBindingFromEnv(identity, 'yvj6e9zboi7ofo', 'qwen3:30b', {
    COS_WORKING_DISTILLATION_BASE_MODEL_ID: 'Qwen/Qwen3-30B-A3B-Thinking-2507',
  })

  assert.equal(binding.eligible, false)
  assert.equal(binding.bindingSource, 'unbound')
  assert.ok(binding.blockers.includes('declared_runtime_digest_invalid'))
  assert.ok(binding.blockers.includes('trainable_base_revision_invalid'))
})
