import assert from 'node:assert/strict'
import test from 'node:test'
import { parseBuyerModelProfiles } from '../lib/ai/modelCapabilityRegistry.ts'
import { runPlatformModelCertification } from '../lib/ai/modelCertification.ts'
import type { ModelTransportAdapter, PlatformModelRequest } from '../lib/ai/modelTransportAdapter.ts'

function profile(input: {
  inference?: Record<string, string>
  transport?: 'custom_http' | 'openai_compatible'
}) {
  return parseBuyerModelProfiles(JSON.stringify([{
    key: 'buyer-cert-model-v1',
    family: 'buyer',
    modelId: 'buyer/cert-model',
    providerModelId: 'cert-model',
    revisionPolicy: 'runtime_owned',
    uses: ['cos_reasoner', 'builder', 'specialist'],
    transportProtocols: [input.transport || 'custom_http'],
    inference: { chatCompletion: 'validated', ...(input.inference || {}) },
    training: {},
  }]))[0]
}

function adapterFor(p: ReturnType<typeof profile>, options: { health?: boolean } = {}): ModelTransportAdapter {
  return {
    id: 'test:buyer-cert',
    protocol: p.transportProtocols[0] as ModelTransportAdapter['protocol'],
    supports: candidate => candidate.key === p.key,
    health: async candidate => ({
      ok: options.health !== false,
      provider: 'buyer',
      model: candidate.providerModelId,
      error: options.health === false ? 'offline' : null,
    }),
    chat: async (request: PlatformModelRequest) => {
      if (request.tools?.length) {
        return {
          text: null,
          toolCalls: [{ id: 'call-1', name: 'certify_echo', arguments: JSON.stringify({ token: 'ITMOUNTS_MODEL_CERT_TOOL', hidden: 'THIS_OUTPUT_MUST_NOT_PERSIST' }) }],
          finishReason: 'tool_calls',
          provider: 'buyer',
          model: request.profile.providerModelId,
          inputTokens: 10,
          outputTokens: 4,
          requestId: 'req-tool',
        }
      }
      if (request.jsonObject) {
        return {
          text: JSON.stringify({ ok: true, marker: 'ITMOUNTS_MODEL_CERT_JSON', hidden: 'THIS_OUTPUT_MUST_NOT_PERSIST' }),
          toolCalls: [],
          finishReason: 'stop',
          provider: 'buyer',
          model: request.profile.providerModelId,
          inputTokens: 8,
          outputTokens: 6,
          requestId: 'req-json',
        }
      }
      return {
        text: 'ITMOUNTS_MODEL_CERT_OK THIS_OUTPUT_MUST_NOT_PERSIST',
        toolCalls: [],
        finishReason: 'stop',
        provider: 'buyer',
        model: request.profile.providerModelId,
        inputTokens: 5,
        outputTokens: 3,
        requestId: 'req-chat',
      }
    },
  }
}

test('certification proves chat/json/tools while persisting metadata only', async () => {
  const p = profile({ inference: { structuredJson: 'validated', toolCalling: 'validated' } })
  const writes: any[] = []
  const receipt = await runPlatformModelCertification({
    profileKey: p.key,
    profiles: [p],
    adapters: [adapterFor(p)],
    id: () => 'cert-1',
    now: (() => {
      const values = [new Date('2026-09-25T18:00:00Z'), new Date('2026-09-25T18:00:05Z')]
      return () => values.shift() || new Date('2026-09-25T18:00:05Z')
    })(),
    db: {
      from(table: string) {
        assert.equal(table, 'supervisor_audit_events')
        return { async insert(value: unknown) { writes.push(value); return { error: null } } }
      },
    },
  })
  assert.equal(receipt.status, 'passed')
  assert.deepEqual(receipt.checks.map(item => [item.id, item.status]), [
    ['health', 'passed'],
    ['chat_completion', 'passed'],
    ['structured_json', 'passed'],
    ['tool_calling', 'passed'],
  ])
  assert.equal(writes.length, 1)
  const serialized = JSON.stringify(writes[0])
  assert.doesNotMatch(serialized, /THIS_OUTPUT_MUST_NOT_PERSIST/)
  assert.doesNotMatch(serialized, /ITMOUNTS_MODEL_CERT_OK/)
  assert.match(serialized, /outputsPersisted/)
  assert.match(serialized, /credentialsPersisted/)
  assert.match(serialized, /authorityExpanded/)
})

test('validated capabilities outside the transport suite make the receipt partial rather than overclaiming', async () => {
  const p = profile({ inference: { streaming: 'validated' } })
  const receipt = await runPlatformModelCertification({
    profileKey: p.key,
    profiles: [p],
    adapters: [adapterFor(p)],
    id: () => 'cert-2',
  })
  assert.equal(receipt.status, 'partial')
  assert.deepEqual(receipt.unverifiedDeclaredCapabilities, ['streaming'])
})

test('failed health fails closed before model prompts and still records a receipt', async () => {
  const p = profile({})
  let chatCalls = 0
  const base = adapterFor(p, { health: false })
  const adapter: ModelTransportAdapter = { ...base, chat: async request => { chatCalls += 1; return base.chat(request) } }
  const writes: any[] = []
  const receipt = await runPlatformModelCertification({
    profileKey: p.key,
    profiles: [p],
    adapters: [adapter],
    id: () => 'cert-3',
    db: { from: () => ({ async insert(value: unknown) { writes.push(value); return { error: null } } }) },
  })
  assert.equal(receipt.status, 'failed')
  assert.equal(chatCalls, 0)
  assert.equal(receipt.checks[0].id, 'health')
  assert.equal(receipt.checks[0].status, 'failed')
  assert.equal(writes.length, 1)
})

test('unknown profile and missing transport adapter fail closed', async () => {
  const p = profile({})
  await assert.rejects(
    () => runPlatformModelCertification({ profileKey: 'missing', profiles: [p], adapters: [] }),
    /platform_model_certification_profile_not_found/,
  )
  await assert.rejects(
    () => runPlatformModelCertification({ profileKey: p.key, profiles: [p], adapters: [] }),
    /platform_model_transport_unavailable/,
  )
})
