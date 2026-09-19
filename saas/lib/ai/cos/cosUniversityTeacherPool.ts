import { createHash } from 'node:crypto'

export type UniversityTeacherProvider = string
export type UniversityTeacherTransport =
  | 'huggingface_job'
  | 'openai_responses'
  | 'openai_compatible'
  | 'anthropic_messages'
  | 'custom_adapter'

export type UniversityTeacherDefinition = Readonly<{
  id: string
  provider: UniversityTeacherProvider
  transport: UniversityTeacherTransport
  model: string
  credentialEnv: string | null
  enabledEnv: string
  adapterReadyEnv?: string | null
  modelEnv?: string | null
  endpointEnv?: string | null
  defaultEndpoint?: string | null
  massDistillationEligible?: boolean
  buyerOwnedCredential: true
  provenanceRequired: true
  costCeilingRequired: true
  silentFallbackAllowed: false
}>

export const UNIVERSITY_TEACHER_POOL_PROFILE = 'cos-university-enterprise-teacher-pool-v2' as const
export const UNIVERSITY_TEACHER_PROVIDER_CONFIG_ENV = 'COS_UNIVERSITY_TEACHER_PROVIDERS_JSON' as const

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
    id: 'openai', provider: 'openai', transport: 'openai_responses', model: 'buyer-configured',
    credentialEnv: 'OPENAI_API_KEY', enabledEnv: 'COS_UNIVERSITY_TEACHER_OPENAI_ENABLED',
    adapterReadyEnv: 'COS_UNIVERSITY_TEACHER_OPENAI_ADAPTER_READY',
    modelEnv: 'COS_UNIVERSITY_TEACHER_OPENAI_MODEL',
    endpointEnv: 'COS_UNIVERSITY_TEACHER_OPENAI_ENDPOINT',
    defaultEndpoint: 'https://api.openai.com/v1/responses',
    massDistillationEligible: true,
    buyerOwnedCredential: true, provenanceRequired: true, costCeilingRequired: true, silentFallbackAllowed: false,
  }),
  Object.freeze({
    id: 'claude', provider: 'anthropic', transport: 'anthropic_messages', model: 'buyer-configured',
    credentialEnv: 'ANTHROPIC_API_KEY', enabledEnv: 'COS_UNIVERSITY_TEACHER_ANTHROPIC_ENABLED',
    adapterReadyEnv: 'COS_UNIVERSITY_TEACHER_CLAUDE_ADAPTER_READY',
    modelEnv: 'COS_UNIVERSITY_TEACHER_ANTHROPIC_MODEL',
    endpointEnv: 'COS_UNIVERSITY_TEACHER_ANTHROPIC_ENDPOINT',
    defaultEndpoint: 'https://api.anthropic.com/v1/messages',
    massDistillationEligible: true,
    buyerOwnedCredential: true, provenanceRequired: true, costCeilingRequired: true, silentFallbackAllowed: false,
  }),
  Object.freeze({
    id: 'grok', provider: 'xai', transport: 'openai_compatible', model: 'buyer-configured',
    credentialEnv: 'XAI_API_KEY', enabledEnv: 'COS_UNIVERSITY_TEACHER_XAI_ENABLED',
    adapterReadyEnv: 'COS_UNIVERSITY_TEACHER_GROK_ADAPTER_READY',
    modelEnv: 'COS_UNIVERSITY_TEACHER_XAI_MODEL',
    endpointEnv: 'COS_UNIVERSITY_TEACHER_XAI_ENDPOINT',
    defaultEndpoint: 'https://api.x.ai/v1/chat/completions',
    massDistillationEligible: true,
    buyerOwnedCredential: true, provenanceRequired: true, costCeilingRequired: true, silentFallbackAllowed: false,
  }),
  Object.freeze({
    id: 'custom', provider: 'custom', transport: 'custom_adapter', model: 'buyer-configured',
    credentialEnv: 'COS_UNIVERSITY_TEACHER_CUSTOM_TOKEN', enabledEnv: 'COS_UNIVERSITY_TEACHER_CUSTOM_ENABLED',
    adapterReadyEnv: 'COS_UNIVERSITY_TEACHER_CUSTOM_ADAPTER_READY',
    modelEnv: 'COS_UNIVERSITY_TEACHER_CUSTOM_MODEL',
    endpointEnv: 'COS_UNIVERSITY_TEACHER_CUSTOM_ENDPOINT',
    massDistillationEligible: false,
    buyerOwnedCredential: true, provenanceRequired: true, costCeilingRequired: true, silentFallbackAllowed: false,
  }),
])

type Env = Record<string, string | undefined>
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SAFE_PROVIDER = /^[a-z0-9][a-z0-9._-]{0,79}$/
const SAFE_ENV = /^[A-Z][A-Z0-9_]{1,119}$/
const CONFIGURABLE_TRANSPORTS = new Set<UniversityTeacherTransport>([
  'openai_responses',
  'openai_compatible',
  'anthropic_messages',
  'custom_adapter',
])

function truthy(value: unknown): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase())
}

function safeHttpsEndpoint(value: unknown): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) return null
    return url.toString()
  } catch {
    return null
  }
}

function parseConfiguredUniversityTeachers(env: Env): { definitions: UniversityTeacherDefinition[]; errors: string[] } {
  const raw = String(env[UNIVERSITY_TEACHER_PROVIDER_CONFIG_ENV] ?? '').trim()
  if (!raw) return { definitions: [], errors: [] }
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return { definitions: [], errors: ['provider_config_invalid_json'] } }
  if (!Array.isArray(parsed)) return { definitions: [], errors: ['provider_config_must_be_array'] }

  const definitions: UniversityTeacherDefinition[] = []
  const errors: string[] = []
  const builtInIds = new Set(UNIVERSITY_TEACHERS.map(item => item.id))
  const seen = new Set<string>()

  for (const [index, value] of parsed.slice(0, 32).entries()) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { errors.push(`provider_${index}_invalid`); continue }
    const item = value as Record<string, unknown>
    const id = String(item.id ?? '').trim().toLowerCase()
    const provider = String(item.provider ?? id).trim().toLowerCase()
    const transport = String(item.transport ?? '') as UniversityTeacherTransport
    const credentialEnv = String(item.credentialEnv ?? '').trim()
    const enabledEnv = String(item.enabledEnv ?? '').trim()
    const adapterReadyEnv = String(item.adapterReadyEnv ?? '').trim()
    const modelEnv = String(item.modelEnv ?? '').trim()
    const endpointEnv = String(item.endpointEnv ?? '').trim()
    const defaultEndpointRaw = String(item.defaultEndpoint ?? '').trim()
    const defaultEndpoint = defaultEndpointRaw ? safeHttpsEndpoint(defaultEndpointRaw) : null

    const valid =
      SAFE_ID.test(id) && !builtInIds.has(id) && !seen.has(id) &&
      SAFE_PROVIDER.test(provider) && CONFIGURABLE_TRANSPORTS.has(transport) &&
      SAFE_ENV.test(credentialEnv) && SAFE_ENV.test(enabledEnv) &&
      SAFE_ENV.test(adapterReadyEnv) && SAFE_ENV.test(modelEnv) && SAFE_ENV.test(endpointEnv) &&
      (!defaultEndpointRaw || Boolean(defaultEndpoint))

    if (!valid) { errors.push(`provider_${index}_invalid`); continue }
    seen.add(id)
    definitions.push(Object.freeze({
      id,
      provider,
      transport,
      model: 'buyer-configured',
      credentialEnv,
      enabledEnv,
      adapterReadyEnv,
      modelEnv,
      endpointEnv,
      defaultEndpoint,
      massDistillationEligible: item.massDistillationEligible === true,
      buyerOwnedCredential: true,
      provenanceRequired: true,
      costCeilingRequired: true,
      silentFallbackAllowed: false,
    }))
  }
  if (parsed.length > 32) errors.push('provider_config_limit_exceeded')
  return { definitions, errors }
}

export function universityTeacherDefinitions(env: Env = process.env): readonly UniversityTeacherDefinition[] {
  const configured = parseConfiguredUniversityTeachers(env)
  return Object.freeze([...UNIVERSITY_TEACHERS, ...configured.definitions])
}

function credentialPresent(definition: UniversityTeacherDefinition, env: Env): boolean {
  if (!definition.credentialEnv) return false
  return String(env[definition.credentialEnv] ?? '').trim().length >= 20
}

function configuredModelPresent(definition: UniversityTeacherDefinition, env: Env): boolean {
  if (definition.transport === 'huggingface_job') return Boolean(definition.model)
  if (definition.modelEnv) return String(env[definition.modelEnv] ?? '').trim().length > 0
  return Boolean(definition.model && definition.model !== 'buyer-configured')
}

function endpointPresent(definition: UniversityTeacherDefinition, env: Env): boolean {
  if (definition.transport === 'huggingface_job') return true
  const configured = definition.endpointEnv ? String(env[definition.endpointEnv] ?? '').trim() : ''
  return Boolean(safeHttpsEndpoint(configured || definition.defaultEndpoint || ''))
}

export function universityTeacherPoolStatus(env: Env = process.env) {
  const configured = parseConfiguredUniversityTeachers(env)
  const definitions = [...UNIVERSITY_TEACHERS, ...configured.definitions]
  const providers = definitions.map(definition => {
    const explicitlyEnabled = truthy(env[definition.enabledEnv])
    const adapterReady = definition.transport === 'huggingface_job'
      ? true
      : definition.adapterReadyEnv
        ? truthy(env[definition.adapterReadyEnv])
        : false
    const credentialReady = credentialPresent(definition, env)
    const modelReady = configuredModelPresent(definition, env)
    const endpointReady = endpointPresent(definition, env)
    return Object.freeze({
      ...definition,
      explicitlyEnabled,
      adapterReady,
      credentialReady,
      modelReady,
      endpointReady,
      active: explicitlyEnabled && adapterReady && credentialReady && modelReady && endpointReady,
    })
  })
  return Object.freeze({
    profile: UNIVERSITY_TEACHER_POOL_PROFILE,
    providers: Object.freeze(providers),
    activeProviders: Object.freeze(providers.filter(item => item.active)),
    configurationErrors: Object.freeze(configured.errors),
    providerLockIn: false,
    buyerOwnedCredentials: true,
    configDrivenProviders: true,
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
  const env = input.env || process.env
  const status = universityTeacherPoolStatus(env)
  const allowed = input.allowedTransports?.length ? new Set(input.allowedTransports) : null
  const candidates = status.activeProviders.filter(item => !allowed || allowed.has(item.transport))
  if (!candidates.length) return null
  const digest = createHash('sha256').update(`${UNIVERSITY_TEACHER_POOL_PROFILE}:${input.routingKey}`).digest()
  const index = digest.readUInt32BE(0) % candidates.length
  const selected = candidates[index]
  return universityTeacherDefinitions(env).find(item => item.id === selected.id) || null
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
