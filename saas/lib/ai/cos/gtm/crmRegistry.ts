import type { ICosCrmConnector } from './crmConnector'
import { SignalBoostCrmConnector } from './signalBoostCrmConnector'

const builtIn = new SignalBoostCrmConnector()

/**
 * COS resolves CRM capability here instead of importing a vendor SDK in strategy code.
 * External adapters can be registered later without changing the GTM agents.
 */
export function getCosCrmConnector(provider = process.env.COS_CRM_PROVIDER || 'signalboost'): ICosCrmConnector {
  const normalized = String(provider || '').trim().toLowerCase()
  if (!normalized || normalized === 'signalboost' || normalized === 'internal') return builtIn
  throw new Error(`COS CRM provider '${normalized}' is not installed. Supported provider: signalboost.`)
}

export function listCosCrmProviders(): Array<{ provider: string; configured: boolean }> {
  return [{ provider: builtIn.provider, configured: builtIn.isConfigured() }]
}
