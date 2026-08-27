import {
  SOCIAL_CONNECTORS,
  platformContentKind,
  platformNeedsAccountRef,
  type SocialPlatform,
} from './social-connectors.ts'
import { loadCustomPlatforms } from './platform-declarations.ts'

export type SocialCapabilityInventoryItem = {
  platform: SocialPlatform
  label: string
  authUrl: string
  scopes: string[]
  contentKind: string
  needsAccountRef: boolean
  env: { clientId: boolean; clientSecret: boolean }
  token: {
    connected: true
    accountRef: string | null
    accountName: string | null
    scopes: string[]
    expiresAt: string | null
    expired: boolean
  } | null
  destinations: Array<{
    accountRef: string | null
    accountName: string | null
    kind: string | null
    hasAccessToken: boolean
    discoveredAt: string | null
  }>
  destinationDiscoveryReady: boolean
  configured: boolean
  connected: boolean
  publishReady: boolean
  missing: string[]
  status: 'publish_ready' | 'configure_connection' | 'configure_provider_app'
}

export type SocialCapabilityInventory = {
  schemaReady: boolean
  destinationsReady: boolean
  schemaError: string | null
  destinationSchemaError: string | null
  mode: 'enterprise_plug_and_play_social_outreach'
  summary: {
    supportedPlatforms: number
    configuredProviders: number
    publishReadyPlatforms: number
    draftReady: boolean
    publishReady: boolean
  }
  rules: {
    noFakeSuccess: true
    ownerApprovalRequiredBeforePublish: true
    storedOAuthTokensRequired: true
    destinationRefsRequiredWhenPlatformNeedsIt: true
    automatedDestinationDiscovery: true
    panicSwitchHonored: true
    dailySendLimitHonored: true
  }
  platforms: SocialCapabilityInventoryItem[]
}

type AnyClient = { from: (table: string) => any }

type SocialCapabilityInventoryOptions = {
  admin: AnyClient
  userId: string
  env?: Record<string, string | undefined>
}

function envPrefix(platform: SocialPlatform): string {
  return `SOCIAL_${platform.toUpperCase()}`
}

function envStatus(platform: SocialPlatform, env: Record<string, string | undefined>) {
  const prefix = envPrefix(platform)
  return {
    clientId: Boolean(String(env[`${prefix}_CLIENT_ID`] || '').trim()),
    clientSecret: Boolean(String(env[`${prefix}_CLIENT_SECRET`] || '').trim()),
  }
}

function safeTokenStatus(row: any): SocialCapabilityInventoryItem['token'] {
  if (!row) return null
  const expiresAt = row.expires_at ? String(row.expires_at) : null
  const expired = expiresAt ? new Date(expiresAt).getTime() <= Date.now() + 60_000 : false
  return {
    connected: true,
    accountRef: row.account_ref ? String(row.account_ref) : null,
    accountName: row.account_name ? String(row.account_name) : null,
    scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
    expiresAt,
    expired,
  }
}

function safeDestination(row: any): SocialCapabilityInventoryItem['destinations'][number] {
  return {
    accountRef: row.account_ref ? String(row.account_ref) : null,
    accountName: row.account_name ? String(row.account_name) : null,
    kind: row.kind ? String(row.kind) : null,
    hasAccessToken: Boolean(row.access_token),
    discoveredAt: row.discovered_at ? String(row.discovered_at) : null,
  }
}

/**
 * Safe readiness projection for the existing Marketing + Sales social adapters.
 * Provider Hub and the existing social cockpit both consume this projection so the
 * adapter inventory and readiness rules cannot drift into separate implementations.
 * No OAuth token, refresh token, client id, or client secret is returned.
 */
export async function loadSocialCapabilityInventory(
  options: SocialCapabilityInventoryOptions,
): Promise<SocialCapabilityInventory> {
  const userId = String(options.userId || '').trim()
  if (!userId) throw new Error('social capability inventory userId is required')
  const env = options.env ?? process.env

  // Custom declarations are process-memory backed in serverless workers; hydrate them before
  // connector lookups. The canonical built-in list remains SOCIAL_CONNECTORS.
  await loadCustomPlatforms(options.admin as any)

  const tokenRes = await options.admin
    .from('outreach_social_tokens')
    .select('platform, account_ref, account_name, scopes, expires_at')
    .eq('user_id', userId)
  const destinationRes = await options.admin
    .from('outreach_social_destinations')
    .select('platform, account_ref, account_name, kind, access_token, discovered_at')
    .eq('user_id', userId)

  const schemaReady = !tokenRes.error
  const destinationsReady = !destinationRes.error
  const tokens = new Map<string, any>((tokenRes.data || []).map((row: any) => [String(row.platform), row]))
  const destinationMap = new Map<string, any[]>()
  for (const row of destinationRes.data || []) {
    const key = String(row.platform)
    destinationMap.set(key, [...(destinationMap.get(key) || []), row])
  }

  const platforms = (Object.keys(SOCIAL_CONNECTORS) as SocialPlatform[]).map((platform): SocialCapabilityInventoryItem => {
    const connector = SOCIAL_CONNECTORS[platform]
    const platformEnv = envStatus(platform, env)
    const token = safeTokenStatus(tokens.get(platform))
    const destinations = (destinationMap.get(platform) || []).map(safeDestination)
    const needsAccountRef = platformNeedsAccountRef(platform)
    const contentKind = platformContentKind(platform)
    const missing: string[] = []

    if (!platformEnv.clientId) missing.push(`${envPrefix(platform)}_CLIENT_ID`)
    if (!platformEnv.clientSecret) missing.push(`${envPrefix(platform)}_CLIENT_SECRET`)
    if (!token) missing.push('connected_oauth_token')
    if (token?.expired) missing.push('fresh_oauth_token')
    if (needsAccountRef && !token?.accountRef) {
      missing.push(destinations.length ? 'select_destination_account_ref' : 'discover_or_enter_account_ref_destination')
    }

    const configured = platformEnv.clientId && platformEnv.clientSecret
    const connected = Boolean(token && !token.expired)
    const publishReady = configured && connected && (!needsAccountRef || Boolean(token?.accountRef))

    return {
      platform,
      label: connector.label,
      authUrl: connector.authUrl,
      scopes: connector.scopes.map(String),
      contentKind,
      needsAccountRef,
      env: platformEnv,
      token,
      destinations,
      destinationDiscoveryReady: connected,
      configured,
      connected,
      publishReady,
      missing,
      status: publishReady ? 'publish_ready' : configured ? 'configure_connection' : 'configure_provider_app',
    }
  })

  const publishReadyCount = platforms.filter(platform => platform.publishReady).length
  const configuredCount = platforms.filter(platform => platform.configured).length

  return {
    schemaReady,
    destinationsReady,
    schemaError: tokenRes.error?.message || null,
    destinationSchemaError: destinationRes.error?.message || null,
    mode: 'enterprise_plug_and_play_social_outreach',
    summary: {
      supportedPlatforms: platforms.length,
      configuredProviders: configuredCount,
      publishReadyPlatforms: publishReadyCount,
      draftReady: schemaReady,
      publishReady: publishReadyCount > 0,
    },
    rules: {
      noFakeSuccess: true,
      ownerApprovalRequiredBeforePublish: true,
      storedOAuthTokensRequired: true,
      destinationRefsRequiredWhenPlatformNeedsIt: true,
      automatedDestinationDiscovery: true,
      panicSwitchHonored: true,
      dailySendLimitHonored: true,
    },
    platforms,
  }
}
