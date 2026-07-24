// saas/console-core/executors/social-outreach.ts
// Hub provider executors for enterprise social networks. These are not
// placeholders: they read live env/token/destination state and call the same
// provider-backed services used by /dashboard/outreach/social.

import { registerExecutor } from '../defaultHost'
import { getSecret } from '../secrets'
import { getDataStore } from '../dataStore'
import type { ActionSchema } from '../types'
import { buildOAuthUrl, SOCIAL_CONNECTORS, platformContentKind, platformNeedsAccountRef, type SocialPlatform } from '@/lib/outreach/social-connectors'
import { discoverSocialDestinations } from '@/lib/outreach/social-destinations'

type ProviderId = 'youtube' | 'linkedin' | 'tiktok' | 'reddit' | 'instagram' | 'facebook' | 'twitter_x'

const PROVIDER_TO_PLATFORM: Record<ProviderId, SocialPlatform> = {
  youtube: 'youtube_channels',
  linkedin: 'linkedin_company',
  tiktok: 'tiktok',
  reddit: 'reddit',
  instagram: 'instagram_business',
  facebook: 'facebook_pages',
  twitter_x: 'twitter_x',
}

function envPrefix(platform: SocialPlatform) { return `SOCIAL_${platform.toUpperCase()}` }
function envStatus(platform: SocialPlatform) {
  const prefix = envPrefix(platform)
  return { clientId: Boolean(getSecret(`${prefix}_CLIENT_ID`)), clientSecret: Boolean(getSecret(`${prefix}_CLIENT_SECRET`)) }
}
function publicToken(row: any) {
  if (!row) return null
  const expiresAt = row.expires_at ? String(row.expires_at) : null
  const expired = expiresAt ? new Date(expiresAt).getTime() <= Date.now() + 60_000 : false
  return { connected: true, accountRef: row.account_ref || null, accountName: row.account_name || null, scopes: Array.isArray(row.scopes) ? row.scopes : [], expiresAt, expired }
}
function publicDestination(row: any) {
  return { accountRef: row.account_ref, accountName: row.account_name || null, kind: row.kind || null, hasAccessToken: Boolean(row.access_token), discoveredAt: row.discovered_at || null }
}
async function platformCapability(userId: string, platform: SocialPlatform) {
  const tokenRow = await getDataStore().getSocialToken(userId, platform)
  const destRows = await getDataStore().getSocialDestinations(userId, platform)
  const env = envStatus(platform)
  const token = publicToken(tokenRow)
  const destinations = (destRows || []).map(publicDestination)
  const needsAccountRef = platformNeedsAccountRef(platform)
  const missing: string[] = []
  if (!env.clientId) missing.push(`${envPrefix(platform)}_CLIENT_ID`)
  if (!env.clientSecret) missing.push(`${envPrefix(platform)}_CLIENT_SECRET`)
  if (!token) missing.push('connected_oauth_token')
  if (token?.expired) missing.push('fresh_oauth_token')
  if (needsAccountRef && !token?.accountRef) missing.push(destinations.length ? 'select_destination_account_ref' : 'discover_or_enter_account_ref_destination')
  const configured = env.clientId && env.clientSecret
  const connected = Boolean(token && !token.expired)
  const publishReady = configured && connected && (!needsAccountRef || Boolean(token?.accountRef))
  return { platform, label: SOCIAL_CONNECTORS[platform].label, contentKind: platformContentKind(platform), needsAccountRef, env, token, destinations, configured, connected, publishReady, missing, status: publishReady ? 'publish_ready' : configured ? 'configure_connection' : 'configure_provider_app' }
}
async function loadDiscoveryToken(userId: string, platform: SocialPlatform) {
  const data = await getDataStore().getSocialToken(userId, platform)
  if (data) return data
  if (platform === 'instagram_business') {
    return (await getDataStore().getSocialToken(userId, 'facebook_pages')) || null
  }
  return null
}
async function storeDestinations(userId: string, platform: SocialPlatform, autoSelect: boolean) {
  const token = await loadDiscoveryToken(userId, platform)
  if (!token?.access_token) return { ok: false, error: `${platform} is not connected or has no access token.` }
  const discovered = await discoverSocialDestinations(platform, token.access_token)
  if (!discovered.ok) return { ok: false, error: discovered.error || 'destination_discovery_failed', data: discovered }
  const stored: any[] = []
  for (const item of discovered.destinations) {
    const data = await getDataStore().upsertSocialDestination({
      user_id: userId,
      platform: item.platform,
      account_ref: item.accountRef,
      account_name: item.accountName,
      kind: item.kind,
      access_token: item.accessToken || null,
      metadata: item.metadata || {},
      discovered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    if (data) stored.push(publicDestination(data))
  }
  const selectable = discovered.destinations.filter(item => item.kind !== 'reddit_user_identity')
  let selected: any = null
  if (autoSelect && selectable.length === 1) {
    selected = selectable[0]
    const patch: Record<string, unknown> = { account_ref: selected.accountRef, account_name: selected.accountName, updated_at: new Date().toISOString() }
    if (selected.accessToken) patch.access_token = selected.accessToken
    await getDataStore().updateSocialToken(userId, platform, patch)
  }
  return { ok: true, message: `Discovered ${stored.length} destination${stored.length === 1 ? '' : 's'}`, data: { mode: discovered.mode, destinations: stored, selected } }
}

const schema = (id: string, label: string, verb: string, fields: any[] = []): ActionSchema => ({ id, label, verb, fields })

for (const providerId of Object.keys(PROVIDER_TO_PLATFORM) as ProviderId[]) {
  const platform = PROVIDER_TO_PLATFORM[providerId]
  const label = SOCIAL_CONNECTORS[platform].label

  registerExecutor({
    providerId, actionId: 'capabilities', policyActionId: 'read_provider_status',
    schema: schema(`${providerId}.capabilities`, `${label} Readiness`, 'view'),
    async run(ctx) {
      if (!ctx.user?.id) return { ok: false, error: 'Not authenticated' }
      const data = await platformCapability(ctx.user.id, platform)
      return { ok: true, message: `${label}: ${data.status.replace(/_/g, ' ')}`, data }
    },
  })

  registerExecutor({
    providerId, actionId: 'connect_oauth', policyActionId: 'read_provider_status',
    schema: schema(`${providerId}.connect_oauth`, `Connect ${label}`, 'view'),
    async run(ctx) {
      if (!ctx.user?.id) return { ok: false, error: 'Not authenticated' }
      const redirectUri = '/api/outreach/social/oauth/callback'
      const state = `${ctx.user.id}:${platform}:${Date.now()}`
      const relativeUrl = `/api/outreach/social/oauth?platform=${encodeURIComponent(platform)}`
      const directProviderUrl = buildOAuthUrl(platform, redirectUri, state)
      return { ok: true, message: `Open the OAuth URL to connect ${label}.`, data: { platform, relativeUrl, directProviderUrl, note: 'Use the relativeUrl from the deployed site so the callback origin is correct.' } }
    },
  })

  registerExecutor({
    providerId, actionId: 'discover_destinations', policyActionId: 'read_provider_status',
    schema: schema(`${providerId}.discover_destinations`, `Discover ${label} Destinations`, 'view', [{ id: 'autoSelect', label: 'Auto-select single destination', type: 'boolean' }]),
    async run(ctx, input) {
      if (!ctx.user?.id) return { ok: false, error: 'Not authenticated' }
      return await storeDestinations(ctx.user.id, platform, input.autoSelect !== false)
    },
  })

  registerExecutor({
    providerId, actionId: 'save_destination', policyActionId: 'read_provider_status',
    schema: schema(`${providerId}.save_destination`, `Save ${label} Destination`, 'edit', [
      { id: 'accountRef', label: 'Destination / account reference', type: 'text', required: true },
      { id: 'accountName', label: 'Friendly display name', type: 'text' },
    ]),
    async run(ctx, input) {
      if (!ctx.user?.id) return { ok: false, error: 'Not authenticated' }
      const accountRef = String(input.accountRef || '').trim()
      if (platformNeedsAccountRef(platform) && !accountRef) return { ok: false, error: `${platform} requires a destination/account reference.` }
      const res = await getDataStore().updateSocialToken(ctx.user.id, platform, { account_ref: accountRef || null, account_name: input.accountName ? String(input.accountName) : null, updated_at: new Date().toISOString() })
      if (!res.ok) return { ok: false, error: res.error }
      return { ok: true, message: `${label} destination saved.`, data: { platform, accountRef, accountName: input.accountName || null } }
    },
  })
}
