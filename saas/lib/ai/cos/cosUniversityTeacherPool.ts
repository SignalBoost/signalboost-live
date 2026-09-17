import { createHash } from 'node:crypto'

export type UniversityTeacherProvider = 'huggingface' | 'openai' | 'anthropic' | 'xai' | 'custom'
export type UniversityTeacherTransport = 'huggingface_job' | 'openai_compatible' | 'anthropic_messages' | 'custom_adapter'

export type UniversityTeacherDefinition = Readonly<{
  id: string
  provider: UniversityTeacherProvider
  transport: UniversityTeacherTransport
  model: string
  credentialEnv: string | null
  enabledEnv: string
  buyerOwnedCredential: true
  provenanceRequired: true
  costCeilingRequired: true
  silentFallbackAllowed: false
}>

export const UNIVERSITY_TEACHER_POOL_PROFILE = 'cos-university-enterprise-teacher-pool-v1' as const

export const UNIVERSITY_TEACHERS: readonly UniversityTeacherDefinition[] = Object.freeze([
  Object.freeze({
    id: 'qwen', provider: 'huggingface', transport: 'huggingface_job', model: 'Qwen/Qwen3-8B',
    credentialEnv: 'HF_TOKEN', enabledEnv: 'COS_UNIVERSITY_TEACHER_QWEN_ENABLED',
    buyerOwnedCredential: true, provenanceRequired: true, costCeilingRequired: true, silentFallbackAllowed: false,
  }),
  Object.freeze({
    id: 'deepseek', provider: 'huggingface', transport: 'huggingface_job', model: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
    credentialEnv: 'HF_TOKEN', enabledEnv: 'COS_UNIVERSITY_TEACHER_DEEPSEEK_ENABLED',
    buyerOwnedCredential: true, provenanceRequired: true, costCeilingRequired: true, silentFallbackAllowed: false,
  }),
  Object.freeze({
    id: 'openai', provider: 'openai', transport: 'openai_compatible', model: 'gpt-5.6',
    credentialEnv: 'OPENAI_API_KEY', enabledEnv: 'COS_UNIVERSITY_TEACHER_OPENAI_ENABLED',
    buyerOwnedCredential: true, provenanceRequired: true, costCeilingRequired: true, silentFallbackAllowed: false,
  }),
  Object.freeze({
    id: 'claude', provider: 'anthropic', transport: 'anthropic_messages', model: 'claude-enterprise-configured',
    credentialEnv: 'ANTHROPIC_API_KEY', enabledEnv: 'COS_UNIVERSITY_TEACHER_ANTHROPIC_ENABLED',
    buyerOwnedCredential: true, provenanceRequired: true, costCeilingRequired: true, silentFallbackAllowed: false,
  }),
  Object.freeze({
    id: 'grok', provider: 'xai', transport: 'openai_compatible', model: 'grok-enterprise-configured',
    credentialEnv: 'XAI_API_KEY', enabledEnv: 'COS_UNIVERSITY_TEACHER_XAI_ENABLED',
    buyerOwnedCredential: true, provenanceRequired: true, costCeilingRequired: true, silentFallbackAllowed: false,
  }),
  Object.freeze({
    id: 'custom', provider: 'custom', transport: 'custom_adapter', model: 'buyer-configured',
    credentialEnv: null, enabledEnv: 'COS_UNIVERSITY_TEACHER_CUSTOM_ENABLED',
    buyerOwnedCredential: true, provenanceRequired: true, costCeilingRequired: true, silentFallbackAllowed: false,
  }),
])

type Env = Record<string, string | undefined>

function truthy(value: unknown): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase())
}

function credentialPresent(definition: UniversityTeacherDefinition, env: Env): boolean {
  if (!definition.credentialEnv) return truthy(env.COS_UNIVERSITY_TEACHER_CUSTOM_ADAPTER_READY)
  return String(env[definition.credentialEnv] ?? '').trim().length >= 20
}

export function universityTeacherPoolStatus(env: Env = process.env) {
  const providers = UNIVERSITY_TEACHERS.map(definition => {
    const explicitlyEnabled = truthy(env[definition.enabledEnv])
    const adapterReady = definition.transport === 'huggingface_job'
      ? true
      : definition.id === 'custom'
        ? truthy(env.COS_UNIVERSITY_TEACHER_CUSTOM_ADAPTER_READY)
        : truthy(env[`COS_UNIVERSITY_TEACHER_${definition.id.toUpperCase()}_ADAPTER_READY`])
    const credentialReady = credentialPresent(definition, env)
    return Object.freeze({
      ...definition,
      explicitlyEnabled,
      adapterReady,
      credentialReady,
      active: explicitlyEnabled && adapterReady && credentialReady,
    })
  })
  return Object.freeze({
    profile: UNIVERSITY_TEACHER_POOL_PROFILE,
    providers: Object.freeze(providers),
    activeProviders: Object.freeze(providers.filter(item => item.active)),
    providerLockIn: false,
    buyerOwnedCredentials: true,
    silentFallbackAllowed: false,
  })
}

/**
 * Deterministic routing makes teacher provenance reproducible. It never falls back to a provider
 * that is not explicitly enabled, credentialed and adapter-ready.
 */
export function selectUniversityTeacher(input: {
  routingKey: string
  allowedTransports?: readonly UniversityTeacherTransport[]
  env?: Env
}): UniversityTeacherDefinition | null {
  const status = universityTeacherPoolStatus(input.env || process.env)
  const allowed = input.allowedTransports?.length ? new Set(input.allowedTransports) : null
  const candidates = status.activeProviders.filter(item => !allowed || allowed.has(item.transport))
  if (!candidates.length) return null
  const digest = createHash('sha256').update(`${UNIVERSITY_TEACHER_POOL_PROFILE}:${input.routingKey}`).digest()
  const index = digest.readUInt32BE(0) % candidates.length
  const selected = candidates[index]
  return UNIVERSITY_TEACHERS.find(item => item.id === selected.id) || null
}

export function universityTeacherProvenance(input: {
  teacher: UniversityTeacherDefinition
  routingKey: string
  modelRevision?: string | null
}) {
  return Object.freeze({
    profile: UNIVERSITY_TEACHER_POOL_PROFILE,
    teacherId: input.teacher.id,
    provider: input.teacher.provider,
    transport: input.teacher.transport,
    model: input.teacher.model,
    modelRevision: input.modelRevision || null,
    routingKeyHash: createHash('sha256').update(input.routingKey).digest('hex'),
    buyerOwnedCredential: true,
    costCeilingRequired: true,
    silentFallbackAllowed: false,
    authorityExpanded: false,
  })
}
