import {
  adsTokenName,
  listAdNetworkSetups,
  missingAdNetworkVars,
} from './ads-network-setup.ts'
import { listAdsConnections } from './ads-token-store.ts'
import { supportsAdsOAuth } from './ads-oauth.ts'

export type AdsCapabilityInventoryItem = {
  platformId: string
  label: string
  prerequisite: string
  configured: boolean
  connected: boolean
  ready: boolean
  canConnect: boolean
  tokenSource: 'oauth' | 'environment' | 'none'
  scopes: string[]
  accountRefPresent: boolean
  expiresAt: string | null
  missing: string[]
}

export type AdsCapabilityInventory = {
  mode: 'marketing_sales_existing_ads_adapters'
  networks: AdsCapabilityInventoryItem[]
  summary: {
    supportedNetworks: number
    configuredNetworks: number
    connectedNetworks: number
    readyNetworks: number
  }
}

type AnyClient = { from: (table: string) => any }

type AdsCapabilityInventoryOptions = {
  admin: AnyClient
  env?: Record<string, string | undefined>
}

/**
 * Safe readiness projection of the existing Marketing + Sales paid-ad connections.
 * The returned object never contains access tokens, refresh tokens, developer tokens,
 * client secrets, or any other secret value. A stored OAuth connection satisfies the
 * access-token requirement without forcing the older environment-variable fallback.
 */
export async function loadAdsCapabilityInventory(
  options: AdsCapabilityInventoryOptions,
): Promise<AdsCapabilityInventory> {
  const env = options.env ?? process.env
  const connections = await listAdsConnections(options.admin as any)
  const connected = new Map(connections.map(connection => [connection.platformId, connection]))

  const networks = listAdNetworkSetups().map((setup): AdsCapabilityInventoryItem => {
    const connection = connected.get(setup.id) || null
    const tokenKey = adsTokenName(setup.id)
    const hasEnvToken = Boolean(String(env[tokenKey] || '').trim())
    const rawMissing = missingAdNetworkVars(setup.id, env)
    const missing = connection ? rawMissing.filter(key => key !== tokenKey) : rawMissing
    const tokenSource: AdsCapabilityInventoryItem['tokenSource'] = connection ? 'oauth' : hasEnvToken ? 'environment' : 'none'
    const connectedNow = Boolean(connection)
    const configured = missing.length === 0

    return {
      platformId: setup.id,
      label: setup.label,
      prerequisite: setup.prerequisite,
      configured,
      connected: connectedNow,
      ready: configured && tokenSource !== 'none',
      canConnect: supportsAdsOAuth(setup.id),
      tokenSource,
      scopes: connection?.scopes?.map(String) || [],
      accountRefPresent: Boolean(connection?.accountRef),
      expiresAt: connection?.expiresAt || null,
      missing,
    }
  })

  return {
    mode: 'marketing_sales_existing_ads_adapters',
    networks,
    summary: {
      supportedNetworks: networks.length,
      configuredNetworks: networks.filter(network => network.configured).length,
      connectedNetworks: networks.filter(network => network.connected).length,
      readyNetworks: networks.filter(network => network.ready).length,
    },
  }
}
