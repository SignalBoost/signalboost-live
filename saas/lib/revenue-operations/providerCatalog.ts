// saas/lib/revenue-operations/providerCatalog.ts
// Pre-staged provider metadata only. Live execution remains disabled by feature flags.

import type { RevenueProviderCapability, RevenueProviderDomain } from './contracts'

export type RevenueProviderDefinition = Readonly<{
  providerId: string
  displayName: string
  domain: RevenueProviderDomain
  capabilities: readonly RevenueProviderCapability[]
  connectionMode: 'dedicated' | 'universal'
  enabledByDefault: false
}>

const ACCOUNTING_CAPABILITIES = [
  'customer_lookup','customer_upsert','quote_create','invoice_create','invoice_lookup','invoice_status','payment_status',
] as const satisfies readonly RevenueProviderCapability[]

const PAYMENT_CAPABILITIES = [
  'customer_lookup','payment_status','payment_record',
] as const satisfies readonly RevenueProviderCapability[]

const SUBSCRIPTION_CAPABILITIES = [
  'customer_lookup','subscription_create','subscription_lookup','subscription_update','renewal_lookup','payment_status',
] as const satisfies readonly RevenueProviderCapability[]

function dedicated(providerId: string, displayName: string, domain: RevenueProviderDomain, capabilities: readonly RevenueProviderCapability[]): RevenueProviderDefinition {
  return { providerId, displayName, domain, capabilities, connectionMode: 'dedicated', enabledByDefault: false }
}

export const REVENUE_PROVIDER_CATALOG: readonly RevenueProviderDefinition[] = Object.freeze([
  dedicated('quickbooks-online', 'QuickBooks Online', 'accounting', ACCOUNTING_CAPABILITIES),
  dedicated('xero', 'Xero', 'accounting', ACCOUNTING_CAPABILITIES),
  dedicated('sage', 'Sage', 'accounting', ACCOUNTING_CAPABILITIES),
  dedicated('zoho-books', 'Zoho Books', 'accounting', ACCOUNTING_CAPABILITIES),
  dedicated('freshbooks', 'FreshBooks', 'accounting', ACCOUNTING_CAPABILITIES),
  dedicated('netsuite', 'Oracle NetSuite', 'accounting', ACCOUNTING_CAPABILITIES),
  dedicated('sap-s4hana', 'SAP S/4HANA', 'accounting', ACCOUNTING_CAPABILITIES),
  dedicated('oracle-fusion-erp', 'Oracle Fusion Cloud ERP', 'accounting', ACCOUNTING_CAPABILITIES),
  dedicated('dynamics-365-finance', 'Microsoft Dynamics 365 Finance', 'accounting', ACCOUNTING_CAPABILITIES),
  dedicated('workday-financial-management', 'Workday Financial Management', 'accounting', ACCOUNTING_CAPABILITIES),
  dedicated('infor', 'Infor', 'accounting', ACCOUNTING_CAPABILITIES),

  dedicated('stripe', 'Stripe', 'payment', PAYMENT_CAPABILITIES),
  dedicated('paypal', 'PayPal', 'payment', PAYMENT_CAPABILITIES),
  dedicated('square', 'Square', 'payment', PAYMENT_CAPABILITIES),
  dedicated('adyen', 'Adyen', 'payment', PAYMENT_CAPABILITIES),
  dedicated('authorize-net', 'Authorize.Net', 'payment', PAYMENT_CAPABILITIES),
  dedicated('worldpay', 'Worldpay', 'payment', PAYMENT_CAPABILITIES),
  dedicated('braintree', 'Braintree', 'payment', PAYMENT_CAPABILITIES),

  dedicated('stripe-billing', 'Stripe Billing', 'subscription', SUBSCRIPTION_CAPABILITIES),
  dedicated('chargebee', 'Chargebee', 'subscription', SUBSCRIPTION_CAPABILITIES),
  dedicated('recurly', 'Recurly', 'subscription', SUBSCRIPTION_CAPABILITIES),
  dedicated('paddle', 'Paddle', 'subscription', SUBSCRIPTION_CAPABILITIES),
  dedicated('maxio', 'Maxio', 'subscription', SUBSCRIPTION_CAPABILITIES),
  dedicated('zuora', 'Zuora', 'subscription', SUBSCRIPTION_CAPABILITIES),

  dedicated('avalara', 'Avalara', 'tax', ['tax_estimate']),
  dedicated('vertex', 'Vertex', 'tax', ['tax_estimate']),
  dedicated('sovos', 'Sovos', 'tax', ['tax_estimate']),

  dedicated('docusign', 'DocuSign', 'document', ['document_send','document_status']),
  dedicated('adobe-acrobat-sign', 'Adobe Acrobat Sign', 'document', ['document_send','document_status']),
  dedicated('dropbox-sign', 'Dropbox Sign', 'document', ['document_send','document_status']),

  {
    providerId: 'universal-revenue-adapter',
    displayName: 'Universal Revenue Adapter',
    domain: 'universal',
    capabilities: [...REVENUE_PROVIDER_CAPABILITIES_COMPAT],
    connectionMode: 'universal',
    enabledByDefault: false,
  },
])

const REVENUE_PROVIDER_CAPABILITIES_COMPAT: readonly RevenueProviderCapability[] = [
  'customer_lookup','customer_upsert','quote_create','invoice_create','invoice_lookup','invoice_status','payment_status','payment_record',
  'subscription_create','subscription_lookup','subscription_update','renewal_lookup','tax_estimate','document_send','document_status',
]

export function revenueProvidersFor(domain: RevenueProviderDomain): readonly RevenueProviderDefinition[] {
  return REVENUE_PROVIDER_CATALOG.filter(provider => provider.domain === domain || provider.domain === 'universal')
}

export function findRevenueProvider(providerId: string): RevenueProviderDefinition | null {
  return REVENUE_PROVIDER_CATALOG.find(provider => provider.providerId === providerId) || null
}
