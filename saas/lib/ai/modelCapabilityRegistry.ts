// saas/lib/ai/modelCapabilityRegistry.ts
// Platform-wide, host-controlled model portability/capability registry.
//
// This file is intentionally outside COS University: COS, Builder, specialists, University,
// inference routing and serving may all consume it. Entries state only capabilities that iTMounts
// has actually validated for the exact profile. Unknown or unvalidated capabilities fail closed
// when a consuming subsystem requires them.

export type ModelCapabilityState = 'validated' | 'experimental' | 'blocked' | 'not_validated'

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
  inference: Readonly<{
    openAiCompatibleChat: ModelCapabilityState
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
    inference: Object.freeze({
      openAiCompatibleChat: 'validated',
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
    inference: Object.freeze({
      openAiCompatibleChat: 'validated',
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

export function modelCapabilityProfileForId(modelId: string): PlatformModelProfile | null {
  const normalized = String(modelId || '').trim()
  for (const profile of Object.values(PLATFORM_MODEL_CAPABILITY_REGISTRY)) {
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
