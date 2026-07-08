import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { SOCIAL_CONNECTORS, platformContentKind, platformNeedsAccountRef, type SocialPlatform } from '@/lib/outreach/social-connectors'

export const dynamic = 'force-dynamic'

type EnvStatus = { clientId: boolean; clientSecret: boolean }

function envPrefix(platform: SocialPlatform) { return `SOCIAL_${platform.toUpperCase()}` }
function envStatus(platform: SocialPlatform): EnvStatus {
  const prefix = envPrefix(platform)
  return { clientId: Boolean(process.env[`${prefix}_CLIENT_ID`]), clientSecret: Boolean(process.env[`${prefix}_CLIENT_SECRET`]) }
}
function safeTokenStatus(row: any) {
  if (!row) return null
  const expiresAt = row.expires_at ? String(row.expires_at) : null
  const expired = expiresAt ? new Date(expiresAt).getTime() <= Date.now() + 60_000 : false
  return { connected: true, accountRef: row.account_ref ? String(row.account_ref) : null, accountName: row.account_name ? String(row.account_name) : null, scopes: Array.isArray(row.scopes) ? row.scopes : [], expiresAt, expired }
}
function safeDestination(row: any) {
  return { accountRef: row.account_ref ? String(row.account_ref) : null, accountName: row.account_name ? String(row.account_name) : null, kind: row.kind ? String(row.kind) : null, hasAccessToken: Boolean(row.access_token), discoveredAt: row.discovered_at || null }
}

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const tokenRes = await ctx.admin.from('outreach_social_tokens').select('platform, account_ref, account_name, scopes, expires_at').eq('user_id', ctx.user.id)
  const destinationRes = await ctx.admin.from('outreach_social_destinations').select('platform, account_ref, account_name, kind, access_token, discovered_at').eq('user_id', ctx.user.id)

  const schemaReady = !tokenRes.error
  const destinationsReady = !destinationRes.error
  const tokens = new Map<string, any>((tokenRes.data || []).map((row: any) => [String(row.platform), row]))
  const destinationMap = new Map<string, any[]>()
  for (const row of destinationRes.data || []) {
    const key = String(row.platform)
    destinationMap.set(key, [...(destinationMap.get(key) || []), row])
  }

  const platforms = (Object.keys(SOCIAL_CONNECTORS) as SocialPlatform[]).map(platform => {
    const connector = SOCIAL_CONNECTORS[platform]
    const env = envStatus(platform)
    const token = safeTokenStatus(tokens.get(platform))
    const destinations = (destinationMap.get(platform) || []).map(safeDestination)
    const needsAccountRef = platformNeedsAccountRef(platform)
    const contentKind = platformContentKind(platform)
    const missing: string[] = []
    if (!env.clientId) missing.push(`${envPrefix(platform)}_CLIENT_ID`)
    if (!env.clientSecret) missing.push(`${envPrefix(platform)}_CLIENT_SECRET`)
    if (!token) missing.push('connected_oauth_token')
    if (token?.expired) missing.push('fresh_oauth_token')
    if (needsAccountRef && !token?.accountRef) missing.push(destinations.length ? 'select_destination_account_ref' : 'discover_or_enter_account_ref_destination')

    const configured = env.clientId && env.clientSecret
    const connected = Boolean(token && !token.expired)
    const publishReady = configured && connected && (!needsAccountRef || Boolean(token?.accountRef))
    return { platform, label: connector.label, authUrl: connector.authUrl, scopes: connector.scopes, contentKind, needsAccountRef, env, token, destinations, destinationDiscoveryReady: connected, configured, connected, publishReady, missing, status: publishReady ? 'publish_ready' : configured ? 'configure_connection' : 'configure_provider_app' }
  })

  const publishReadyCount = platforms.filter(p => p.publishReady).length
  const configuredCount = platforms.filter(p => p.configured).length
  return NextResponse.json({
    ok: true,
    schemaReady,
    destinationsReady,
    schemaError: tokenRes.error?.message || null,
    destinationSchemaError: destinationRes.error?.message || null,
    mode: 'enterprise_plug_and_play_social_outreach',
    summary: { supportedPlatforms: platforms.length, configuredProviders: configuredCount, publishReadyPlatforms: publishReadyCount, draftReady: schemaReady, publishReady: publishReadyCount > 0 },
    rules: { noFakeSuccess: true, ownerApprovalRequiredBeforePublish: true, storedOAuthTokensRequired: true, destinationRefsRequiredWhenPlatformNeedsIt: true, automatedDestinationDiscovery: true, panicSwitchHonored: true, dailySendLimitHonored: true },
    platforms,
  })
}
