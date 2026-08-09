// saas/lib/revenue-operations/contracts.ts
// Provider-neutral contracts for accounting, payments, subscriptions and related RevOps systems.
// No provider SDKs or credentials belong in this layer.

export const REVENUE_PROVIDER_DOMAINS = [
  'accounting',
  'payment',
  'subscription',
  'tax',
  'document',
  'universal',
] as const

export type RevenueProviderDomain = (typeof REVENUE_PROVIDER_DOMAINS)[number]

export const REVENUE_PROVIDER_CAPABILITIES = [
  'customer_lookup',
  'customer_upsert',
  'quote_create',
  'invoice_create',
  'invoice_lookup',
  'invoice_status',
  'payment_status',
  'payment_record',
  'subscription_create',
  'subscription_lookup',
  'subscription_update',
  'renewal_lookup',
  'tax_estimate',
  'document_send',
  'document_status',
] as const

export type RevenueProviderCapability = (typeof REVENUE_PROVIDER_CAPABILITIES)[number]

export type RevenueSecretReference = Readonly<{
  kind: 'environment' | 'secret_manager'
  reference: string
}>

export type RevenueProviderContext = Readonly<{
  connectionId: string
  tenantId: string
  locale: string
  secretReferences: readonly RevenueSecretReference[]
}>

export type RevenueProviderHealth = Readonly<{
  state: 'unconfigured' | 'healthy' | 'degraded' | 'rate_limited' | 'authentication_failed' | 'offline' | 'disabled'
  checkedAt: string
  messageKey?: string
}>

export type RevenueProviderResult<T> = Readonly<{
  ok: boolean
  data?: T
  errorCode?: string
  providerRecordId?: string
  retrievedAt: string
}>

export interface RevenueProviderAdapter {
  readonly providerId: string
  readonly displayName: string
  readonly domain: RevenueProviderDomain
  readonly capabilities: readonly RevenueProviderCapability[]

  testConnection(context: RevenueProviderContext): Promise<RevenueProviderHealth>

  execute<TInput, TOutput>(
    capability: RevenueProviderCapability,
    input: TInput,
    context: RevenueProviderContext,
  ): Promise<RevenueProviderResult<TOutput>>
}

export const REVENUE_OPERATIONS_FEATURE_FLAGS = Object.freeze({
  enabled: false,
  liveProviderExecutionEnabled: false,
  accountingWritesEnabled: false,
  paymentWritesEnabled: false,
  subscriptionWritesEnabled: false,
  taxExecutionEnabled: false,
  documentExecutionEnabled: false,
})

export function assertRevenueSecretReferencesOnly(value: unknown): void {
  const serialized = JSON.stringify(value).toLowerCase()
  for (const forbidden of ['api_key','apikey','access_token','refresh_token','client_secret','private_key','authorization']) {
    if (serialized.includes(`\"${forbidden}\"`)) throw new Error('REVENUE_PROVIDER_SECRET_MATERIAL_REJECTED')
  }
}
