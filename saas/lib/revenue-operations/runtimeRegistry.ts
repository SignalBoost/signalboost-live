import type { RevenueProviderAdapter } from './contracts'
import { QuickBooksOnlineAdapter } from './providers/quickbooks'
import { StripeBillingAdapter, StripePaymentAdapter } from './providers/stripe'
import { UniversalRevenueAdapter } from './providers/universal'

const ADAPTERS: readonly RevenueProviderAdapter[] = Object.freeze([
  new QuickBooksOnlineAdapter(),
  new StripePaymentAdapter(),
  new StripeBillingAdapter(),
  new UniversalRevenueAdapter(),
])

export function revenueRuntimeAdapters(): readonly RevenueProviderAdapter[] {
  return ADAPTERS
}

export function revenueRuntimeAdapter(providerId: string): RevenueProviderAdapter | null {
  return ADAPTERS.find(adapter => adapter.providerId === providerId) || null
}
