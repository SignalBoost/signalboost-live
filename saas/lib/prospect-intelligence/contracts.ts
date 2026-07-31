// saas/lib/prospect-intelligence/contracts.ts

export const PROSPECT_INTELLIGENCE_LANGUAGES = ['en', 'es', 'pt', 'pl', 'ru'] as const

export type ProspectIntelligenceLanguage =
  (typeof PROSPECT_INTELLIGENCE_LANGUAGES)[number]

export function normalizeProspectIntelligenceLanguage(
  locale: string | null | undefined,
): ProspectIntelligenceLanguage {
  const normalized = locale?.trim().toLowerCase().replace('_', '-')
  const base = normalized?.split('-')[0]

  return PROSPECT_INTELLIGENCE_LANGUAGES.includes(
    base as ProspectIntelligenceLanguage,
  )
    ? (base as ProspectIntelligenceLanguage)
    : 'en'
}

export const PROSPECT_PROVIDER_CAPABILITIES = [
  'company_search',
  'company_profile',
  'contact_search',
  'email_verification',
  'technology_profile',
  'company_registry',
  'news_research',
  'crm_read',
  'crm_write',
  'ai_generation',
] as const

export type ProspectProviderCapability =
  (typeof PROSPECT_PROVIDER_CAPABILITIES)[number]

export const PROSPECT_PROVIDER_HEALTH_STATES = [
  'unconfigured',
  'healthy',
  'degraded',
  'rate_limited',
  'quota_low',
  'authentication_failed',
  'offline',
  'disabled',
] as const

export type ProspectProviderHealthState =
  (typeof PROSPECT_PROVIDER_HEALTH_STATES)[number]

export type ProspectSecretReference = Readonly<{
  kind: 'environment' | 'secret_manager'
  reference: string
}>

export type ProspectProviderProvenance = Readonly<{
  providerId: string
  sourceRecordId?: string
  retrievedAt: string
  confidence?: number
  sourceUrl?: string
}>

export type ProspectProviderQuota = Readonly<{
  remaining?: number
  limit?: number
  resetsAt?: string
  unit?: 'request' | 'credit' | 'record'
}>

export type ProspectProviderCost = Readonly<{
  amount?: number
  currency?: string
  creditsUsed?: number
}>

export type ProspectProviderResult<T> = Readonly<{
  ok: boolean
  data?: T
  errorCode?: string
  provenance: readonly ProspectProviderProvenance[]
  quota?: ProspectProviderQuota
  cost?: ProspectProviderCost
}>

export type ProspectProviderHealth = Readonly<{
  state: ProspectProviderHealthState
  checkedAt: string
  messageKey?: string
  quota?: ProspectProviderQuota
}>

export type ProspectProviderContext = Readonly<{
  connectionId: string
  secretReferences: readonly ProspectSecretReference[]
  locale: ProspectIntelligenceLanguage
}>

export interface ProspectProviderAdapter {
  readonly providerId: string
  readonly displayName: string
  readonly capabilities: readonly ProspectProviderCapability[]

  testConnection(
    context: ProspectProviderContext,
  ): Promise<ProspectProviderHealth>

  execute<TInput, TOutput>(
    capability: ProspectProviderCapability,
    input: TInput,
    context: ProspectProviderContext,
  ): Promise<ProspectProviderResult<TOutput>>
}

export const PROSPECT_INTELLIGENCE_FEATURE_FLAGS = Object.freeze({
  platformEnabled: false,
  automaticDiscoveryEnabled: false,
  automaticEnrichmentEnabled: false,
  externalMessageSendingEnabled: false,
  replyAutomationEnabled: false,
  scheduledSynchronizationEnabled: false,
  crmWriteEnabled: false,
  liveProviderExecutionEnabled: false,
})

export function assertNoSecretMaterial(value: unknown): void {
  const serialized = JSON.stringify(value).toLowerCase()
  const forbiddenKeys = [
    'api_key',
    'apikey',
    'access_token',
    'refresh_token',
    'client_secret',
    'private_key',
    'authorization',
  ]

  for (const key of forbiddenKeys) {
    if (serialized.includes(`"${key}"`)) {
      throw new Error('PROSPECT_PROVIDER_SECRET_MATERIAL_REJECTED')
    }
  }
}
