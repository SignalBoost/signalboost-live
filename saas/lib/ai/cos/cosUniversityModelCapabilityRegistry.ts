// saas/lib/ai/cos/cosUniversityModelCapabilityRegistry.ts
// Host-controlled model identity/capability registry for COS University.
//
// The registry describes what iTMounts has actually validated for each exact model profile.
// It is not a claim about every capability a model family may have upstream. Unknown or
// unvalidated combinations fail closed instead of being inferred from model names.

export type UniversityModelCapabilityState =
  | 'validated'
  | 'experimental'
  | 'blocked'
  | 'not_validated'

export type UniversityModelRole = 'student' | 'teacher'

export type UniversityModelProfile = Readonly<{
  key: string
  role: UniversityModelRole
  family: string
  modelId: string
  revision: string | null
  revisionPolicy: 'fixed' | 'resolve_and_pin_at_dispatch'
  tokenizerModelId: string
  artifactKind: 'base_model'
  training: Readonly<{
    qlora: UniversityModelCapabilityState
    gkd: UniversityModelCapabilityState
    muonCanary: UniversityModelCapabilityState
    xsa: UniversityModelCapabilityState
  }>
  serving: Readonly<{
    vllm: UniversityModelCapabilityState
    speculativeDecoding: UniversityModelCapabilityState
    eagle: UniversityModelCapabilityState
    dflash: UniversityModelCapabilityState
    mtp: UniversityModelCapabilityState
    xsa: UniversityModelCapabilityState
  }>
  governance: Readonly<{
    immutableRevisionRequired: true
    exactArtifactEvaluationRequired: true
    rollbackRequired: true
    automaticFallbackToDifferentModel: false
  }>
}>

const QWEN3_4B_REVISION = '1cfa9a7208912126459214e8b04321603b3df60c' as const

export const UNIVERSITY_MODEL_CAPABILITY_REGISTRY = Object.freeze({
  'qwen3-4b-student-v1': Object.freeze({
    key: 'qwen3-4b-student-v1',
    role: 'student',
    family: 'qwen3',
    modelId: 'Qwen/Qwen3-4B',
    revision: QWEN3_4B_REVISION,
    revisionPolicy: 'fixed',
    tokenizerModelId: 'Qwen/Qwen3-4B',
    artifactKind: 'base_model',
    training: Object.freeze({
      qlora: 'validated',
      gkd: 'validated',
      muonCanary: 'validated',
      xsa: 'experimental',
    }),
    serving: Object.freeze({
      vllm: 'validated',
      speculativeDecoding: 'not_validated',
      eagle: 'not_validated',
      dflash: 'not_validated',
      mtp: 'not_validated',
      xsa: 'blocked',
    }),
    governance: Object.freeze({
      immutableRevisionRequired: true,
      exactArtifactEvaluationRequired: true,
      rollbackRequired: true,
      automaticFallbackToDifferentModel: false,
    }),
  } satisfies UniversityModelProfile),
  'qwen3-8b-teacher-v1': Object.freeze({
    key: 'qwen3-8b-teacher-v1',
    role: 'teacher',
    family: 'qwen3',
    modelId: 'Qwen/Qwen3-8B',
    revision: null,
    revisionPolicy: 'resolve_and_pin_at_dispatch',
    tokenizerModelId: 'Qwen/Qwen3-8B',
    artifactKind: 'base_model',
    training: Object.freeze({
      qlora: 'not_validated',
      gkd: 'not_validated',
      muonCanary: 'not_validated',
      xsa: 'not_validated',
    }),
    serving: Object.freeze({
      vllm: 'not_validated',
      speculativeDecoding: 'not_validated',
      eagle: 'not_validated',
      dflash: 'not_validated',
      mtp: 'not_validated',
      xsa: 'not_validated',
    }),
    governance: Object.freeze({
      immutableRevisionRequired: true,
      exactArtifactEvaluationRequired: true,
      rollbackRequired: true,
      automaticFallbackToDifferentModel: false,
    }),
  } satisfies UniversityModelProfile),
} as const)

export type UniversityModelProfileKey = keyof typeof UNIVERSITY_MODEL_CAPABILITY_REGISTRY

export const CURRENT_UNIVERSITY_STUDENT_PROFILE = UNIVERSITY_MODEL_CAPABILITY_REGISTRY['qwen3-4b-student-v1']
export const CURRENT_UNIVERSITY_TEACHER_PROFILE = UNIVERSITY_MODEL_CAPABILITY_REGISTRY['qwen3-8b-teacher-v1']

export function universityModelProfileForId(modelId: string): UniversityModelProfile | null {
  const normalized = String(modelId || '').trim()
  for (const profile of Object.values(UNIVERSITY_MODEL_CAPABILITY_REGISTRY)) {
    if (profile.modelId === normalized) return profile
  }
  return null
}

export function requireUniversityModelProfile(modelId: string, role?: UniversityModelRole): UniversityModelProfile {
  const profile = universityModelProfileForId(modelId)
  if (!profile) throw new Error('university_model_not_registered')
  if (role && profile.role !== role) throw new Error('university_model_role_mismatch')
  return profile
}

export function requireUniversityModelCapability(
  profile: UniversityModelProfile,
  surface: 'training' | 'serving',
  capability: string,
): void {
  const capabilities = profile[surface] as Readonly<Record<string, UniversityModelCapabilityState>>
  const state = capabilities[capability]
  if (state !== 'validated') throw new Error(`university_model_capability_not_validated:${surface}:${capability}:${state || 'missing'}`)
}
