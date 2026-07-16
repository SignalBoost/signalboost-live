import { BrowserProviderError } from './provider-errors.ts'

export const browserProviderHealthStates = ['healthy', 'degraded', 'outage', 'unknown', 'suspended'] as const
export type BrowserProviderHealthState = (typeof browserProviderHealthStates)[number]
export interface BrowserProviderHealth { state: BrowserProviderHealthState; checkedAt: string; reasonCode?: string; detailsKey?: string }
export type ProviderHealth = BrowserProviderHealth

export function assertBrowserProviderHealth(health: BrowserProviderHealth): Readonly<BrowserProviderHealth> {
  if (!browserProviderHealthStates.includes(health.state) || new Date(health.checkedAt).toISOString() !== health.checkedAt) {
    throw new BrowserProviderError('invalid_provider_health')
  }
  return Object.freeze({ ...health })
}
