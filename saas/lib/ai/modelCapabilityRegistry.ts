// saas/lib/ai/modelCapabilityRegistry.ts
// Platform-wide, host-controlled model portability/capability registry.
//
// This file is intentionally outside COS University: COS, Builder, specialists, University,
// inference routing and serving may all consume it. Entries state only capabilities that iTMounts
// has actually validated for the exact profile. Unknown or unvalidated capabilities fail closed
// when a consuming subsystem requires them.

export type ModelCapabilityState = 'validated' | 'experimental' | 'blocked' | 'not_validated'

export type ModelTransportProtocol = 'openai_compatible' | 'anthropic_messages' | 'google_generate_content' | 'native_sdk' | 'local_runtime' | 'custom_http'

export type ModelProfileUse =
  | 'cos_reasoner'
  | 'builder'
  | 'specialist'
  | 'university_student'
  | 'university_teacher'
  | 'embedding'
  | 'draft_speculator'

export type PlatformModelProfile = Readonly<{
  key: string
  family: string
  modelId: string
  providerModelId: string
  revision: string | null
  revisionPolicy: 'fixed' | 'resolve_and_pin_at_dispatch' | 'runtime_owned'
  tokenizerModelId: string | null
  uses: readonly ModelProfileUse[]
  transportProtocols: readonly ModelTransportProtocol[]
  inference: Readonly<{
    chatCompletion: ModelCapabilityState
    streaming: ModelCapabilityState
    toolCalling: ModelCapabilityState
    structuredJson: ModelCapabilityState
    vllm: ModelCapabilityState
    speculativeDecoding: ModelCapabilityState
    eagle: ModelCapabilityState
    dflash: ModelCapabilityState
    mtp: ModelCapabilityState
    xsa: ModelCapabilityState
  }>
  training: Readonly<{
    qlora: ModelCapabilityState
    gkd: ModelCapabilityState
    muonCanary: ModelCapabilityState
    xsa: ModelCapabilityState
    testTimeTraining: ModelCapabilityState
  }>
  governance: Readonly<{
    exactRevisionRequiredWhenTrainable: boolean
    exactArtifactEvaluationRequiredWhenTrainable: boolean
    rollbackRequiredWhenTrainable: boolean
    automaticFallbackToDifferentModel: false
  }>
}>

const QWEN3_4B_REVISION = '1cfa9a7208912126459214e8b04321603b3df60c' as const

export const PLATFORM_MODEL_CAPABILITY_REGISTRY = Object.freeze({
  'qwen3-4b-university-student-v1': Object.freeze({
    key: 'qwen3-4b-university-student-v1',
    family: 'qwen3',
    modelId: 'Qwen/Qwen3-4B',
    providerModelId: 'Qwen/Qwen3-4B',
    revision: QWEN3_4B_REVISION,
    revisionPolicy: 'fixed',
    tokenizerModelId: 'Qwen/Qwen3-4B',
    uses: Object.freeze(['university_student'] as const),
    transportProtocols: Object.freeze(['openai_compatible', 'local_runtime'] as const),
    inference: Object.freeze({
      chatCompletion: 'validated',
      streaming: 'validated',
      toolCalling: 'not_validated',
      structuredJson: 'not_validated',
      vllm: 'validated',
      speculativeDecoding: 'not_validated',
      eagle: 'not_validated',
      dflash: 'not_validated',
      mtp: 'not_validated',
      xsa: 'blocked',
    }),
    training: Object.freeze({
      qlora: 'validated',
      gkd: 'validated',
      muonCanary: 'validated',
      xsa: 'experimental',
      testTimeTraining: 'not_validated',
    }),
    governance: Object.freeze({
      exactRevisionRequiredWhenTrainable: true,
      exactArtifactEvaluationRequiredWhenTrainable: true,
      rollbackRequiredWhenTrainable: true,
      automaticFallbackToDifferentModel: false,
    }),
  } satisfies PlatformModelProfile),
  'qwen3-8b-university-teacher-v1': Object.freeze({
    key: 'qwen3-8b-university-teacher-v1',
    family: 'qwen3',
    modelId: 'Qwen/Qwen3-8B',
    providerModelId: 'Qwen/Qwen3-8B',
    revision: null,
    revisionPolicy: 'resolve_and_pin_at_dispatch',
    tokenizerModelId: 'Qwen/Qwen3-8B',
    uses: Object.freeze(['university_teacher'] as const),
    transportProtocols: Object.freeze(['native_sdk'] as const),
    inference: Object.freeze({
      chatCompletion: 'validated',
      streaming: 'not_validated',
      toolCalling: 'not_validated',
      structuredJson: 'not_validated',
      vllm: 'not_validated',
      speculativeDecoding: 'not_validated',
      eagle: 'not_validated',
      dflash: 'not_validated',
      mtp: 'not_validated',
      xsa: 'not_validated',
    }),
    training: Object.freeze({
      qlora: 'not_validated',
      gkd: 'not_validated',
      muonCanary: 'not_validated',
      xsa: 'not_validated',
      testTimeTraining: 'not_validated',
    }),
    governance: Object.freeze({
      exactRevisionRequiredWhenTrainable: true,
      exactArtifactEvaluationRequiredWhenTrainable: true,
      rollbackRequiredWhenTrainable: true,
      automaticFallbackToDifferentModel: false,
    }),
  } satisfies PlatformModelProfile),
} as const)

export type PlatformModelProfileKey = keyof typeof PLATFORM_MODEL_CAPABILITY_REGISTRY

export const CURRENT_UNIVERSITY_STUDENT_PROFILE = PLATFORM_MODEL_CAPABILITY_REGISTRY['qwen3-4b-university-student-v1']
export const CURRENT_UNIVERSITY_TEACHER_PROFILE = PLATFORM_MODEL_CAPABILITY_REGISTRY['qwen3-8b-university-teacher-v1']

const PROFILE_KEY = /^[a-z0-9][a-z0-9._-]{1,119}$/
const MODEL_ID = /^[^\s]{1,240}$/
const REVISION = /^[A-Za-z0-9._/-]{1,240}$/
const TRANSPORT_PROTOCOLS: readonly ModelTransportProtocol[] = Object.freeze(['openai_compatible','anthropic_messages','google_generate_content','native_sdk','local_runtime','custom_http'])
const USES: readonly ModelProfileUse[] = Object.freeze([
  'cos_reasoner', 'builder', 'specialist', 'university_student', 'university_teacher', 'embedding', 'draft_speculator',
])
const STATES: readonly ModelCapabilityState[] = Object.freeze(['validated', 'experimental', 'blocked', 'not_validated'])

function cleanCapabilities(raw: unknown, keys: readonly string[]): Readonly<Record<string, ModelCapabilityState>> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: Record<string, ModelCapabilityState> = {}
  for (const key of keys) {
    const value = String((raw as Record<string, unknown>)[key] ?? 'not_validated') as ModelCapabilityState
    if (!STATES.includes(value)) return null
    out[key] = value
  }
  return Object.freeze(out)
}

const INFERENCE_CAPABILITIES = Object.freeze([
  'chatCompletion', 'streaming', 'toolCalling', 'structuredJson', 'vllm',
  'speculativeDecoding', 'eagle', 'dflash', 'mtp', 'xsa',
] as const)
const TRAINING_CAPABILITIES = Object.freeze(['qlora', 'gkd', 'muonCanary', 'xsa', 'testTimeTraining'] as const)

export function parseBuyerModelProfiles(rawJson: string | undefined): readonly PlatformModelProfile[] {
  const text = String(rawJson || '').trim()
  if (!text) return Object.freeze([])
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw new Error('platform_model_registry_json_invalid') }
  if (!Array.isArray(parsed) || parsed.length > 64) throw new Error('platform_model_registry_shape_invalid')
  const profiles: PlatformModelProfile[] = []
  const seenKeys = new Set<string>()
  const seenIds = new Set<string>()
  for (const item of parsed) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('platform_model_profile_invalid')
    const row = item as Record<string, unknown>
    const key = String(row.key || '').trim().toLowerCase()
    const family = String(row.family || '').trim().toLowerCase()
    const modelId = String(row.modelId || '').trim()
    const providerModelId = String(row.providerModelId || modelId).trim()
    const revisionRaw = row.revision == null ? null : String(row.revision).trim()
    const revisionPolicy = String(row.revisionPolicy || 'runtime_owned') as PlatformModelProfile['revisionPolicy']
    const tokenizerModelId = row.tokenizerModelId == null ? null : String(row.tokenizerModelId).trim()
    const usesRaw = Array.isArray(row.uses) ? row.uses.map(value => String(value)) : []
    const transportProtocolsRaw = Array.isArray(row.transportProtocols) ? row.transportProtocols.map(value => String(value)) : []
    if (!PROFILE_KEY.test(key) || !family || !MODEL_ID.test(modelId) || !MODEL_ID.test(providerModelId)) throw new Error('platform_model_profile_identity_invalid')
    if (revisionRaw && !REVISION.test(revisionRaw)) throw new Error('platform_model_profile_revision_invalid')
    if (!['fixed','resolve_and_pin_at_dispatch','runtime_owned'].includes(revisionPolicy)) throw new Error('platform_model_profile_revision_policy_invalid')
    if (revisionPolicy === 'fixed' && !revisionRaw) throw new Error('platform_model_profile_fixed_revision_required')
    if (tokenizerModelId && !MODEL_ID.test(tokenizerModelId)) throw new Error('platform_model_profile_tokenizer_invalid')
    if (!usesRaw.length || usesRaw.some(value => !USES.includes(value as ModelProfileUse))) throw new Error('platform_model_profile_use_invalid')
    if (!transportProtocolsRaw.length || transportProtocolsRaw.some(value => !TRANSPORT_PROTOCOLS.includes(value as ModelTransportProtocol))) throw new Error('platform_model_profile_transport_invalid')
    if (seenKeys.has(key) || seenIds.has(modelId) || key in PLATFORM_MODEL_CAPABILITY_REGISTRY) throw new Error('platform_model_profile_duplicate')
    const inference = cleanCapabilities(row.inference, INFERENCE_CAPABILITIES)
    const training = cleanCapabilities(row.training, TRAINING_CAPABILITIES)
    if (!inference || !training) throw new Error('platform_model_profile_capabilities_invalid')
    const trainable = usesRaw.includes('university_student')
    const profile: PlatformModelProfile = Object.freeze({
      key, family, modelId, providerModelId, revision: revisionRaw, revisionPolicy, tokenizerModelId,
      uses: Object.freeze([...usesRaw]) as readonly ModelProfileUse[],
      transportProtocols: Object.freeze([...transportProtocolsRaw]) as readonly ModelTransportProtocol[],
      inference: inference as PlatformModelProfile['inference'],
      training: training as PlatformModelProfile['training'],
      governance: Object.freeze({
        exactRevisionRequiredWhenTrainable: trainable,
        exactArtifactEvaluationRequiredWhenTrainable: trainable,
        rollbackRequiredWhenTrainable: trainable,
        automaticFallbackToDifferentModel: false,
      }),
    })
    seenKeys.add(key); seenIds.add(modelId); profiles.push(profile)
  }
  return Object.freeze(profiles)
}

export function configuredBuyerModelProfiles(env: NodeJS.ProcessEnv = process.env): readonly PlatformModelProfile[] {
  return parseBuyerModelProfiles(env.ITMOUNTS_MODEL_REGISTRY_JSON)
}

export function allPlatformModelProfiles(env: NodeJS.ProcessEnv = process.env): readonly PlatformModelProfile[] {
  return Object.freeze([
    ...Object.values(PLATFORM_MODEL_CAPABILITY_REGISTRY),
    ...configuredBuyerModelProfiles(env),
  ])
}
export function modelCapabilityProfileForId(modelId: string): PlatformModelProfile | null {
  const normalized = String(modelId || '').trim()
  for (const profile of allPlatformModelProfiles()) {
    if (profile.modelId === normalized || profile.providerModelId === normalized) return profile
  }
  return null
}

export function requireModelCapabilityProfile(modelId: string, use?: ModelProfileUse): PlatformModelProfile {
  const profile = modelCapabilityProfileForId(modelId)
  if (!profile) throw new Error('platform_model_not_registered')
  if (use && !profile.uses.includes(use as never)) throw new Error('platform_model_use_not_registered')
  return profile
}

export function requireModelCapability(
  profile: PlatformModelProfile,
  surface: 'inference' | 'training',
  capability: string,
): void {
  const capabilities = profile[surface] as Readonly<Record<string, ModelCapabilityState>>
  const state = capabilities[capability]
  if (state !== 'validated') throw new Error(`platform_model_capability_not_validated:${surface}:${capability}:${state || 'missing'}`)
}

export function modelCapabilityState(
  profile: PlatformModelProfile,
  surface: 'inference' | 'training',
  capability: string,
): ModelCapabilityState | null {
  const value = (profile[surface] as Readonly<Record<string, ModelCapabilityState>>)[capability]
  return value || null
}
