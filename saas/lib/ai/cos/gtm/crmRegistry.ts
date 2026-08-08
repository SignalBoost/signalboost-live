import type { CrmStage, CrmSyncResult, ICosCrmConnector } from './crmConnector'
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

/**
 * CRM sync must never make a governed outreach draft disappear. The outreach queue is
 * the authoritative workflow; CRM is a projection of that workflow. Provider failures
 * are returned for telemetry/retry, not thrown into the drafting transaction.
 */
export async function syncCosCrmProductStageBestEffort(input: {
  email: string
  companyName: string
  companyDomain?: string | null
  productKey: string
  stage: CrmStage
  sourceId?: string | null
  notes?: string | null
}): Promise<CrmSyncResult> {
  try {
    const crm = getCosCrmConnector()
    if (!crm.isConfigured()) return { ok: false, provider: crm.provider, error: 'CRM connector is not configured.' }
    return await crm.markProductStage({ ...input })
  } catch (error) {
    return {
      ok: false,
      provider: process.env.COS_CRM_PROVIDER || 'signalboost',
      error: error instanceof Error ? error.message : 'CRM sync failed.',
    }
  }
}
