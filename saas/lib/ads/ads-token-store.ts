// saas/lib/ads/ads-token-store.ts
//
// HOST SIDE of ad-network connections.
//
// ads-oauth.ts knows how to talk to each network and nothing about storage, which is what
// keeps it inside the portable boundary. This file is the SignalBoost host's answer to
// "where does the connection live": a table, reached through an injected client.
//
// THE RULE IT ENFORCES: nothing that spends money gets a stale token. Every read renews
// first if the token is close to expiry, writes the new one back, and copies the new expiry
// onto ads_account_health so the attention watcher can warn days ahead instead of reporting
// the outage afterwards.
//
// AND THE RULE IT REFUSES TO BEND: a renewal that fails is recorded and returned as a
// failure. It never falls back to the expired token and never falls back to the environment
// variable, because both would produce a call that looks authorised, fails at the network,
// and gets blamed on the campaign.

import { refreshAdsToken, exchangeMetaLongLivedToken } from './ads-oauth.ts'

type AnyClient = { from: (table: string) => any }

const TOKENS = 'ads_tokens'
const HEALTH = 'ads_account_health'

/** Renew this far ahead of expiry, so a long request cannot straddle the boundary. */
const RENEW_WITHIN_MS = 10 * 60 * 1000

export type StoredAdsToken = {
  platformId: string
  accountRef: string | null
  expiresAt: string | null
  scopes: string[]
  connectedBy: string | null
  connectedAt: string | null
  lastError: string | null
  /** Never the token itself — the cockpit needs to know a connection exists, not what it is. */
  connected: true
}

export type ResolvedToken =
  | { ok: true; accessToken: string; expiresAt: string | null; renewed: boolean }
  | { ok: false; reason: string }

function view(row: any): StoredAdsToken {
  return {
    platformId: String(row.platform_id),
    accountRef: row.account_ref ? String(row.account_ref) : null,
    expiresAt: row.expires_at || null,
    scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
    connectedBy: row.connected_by || null,
    connectedAt: row.connected_at || null,
    lastError: row.last_error || null,
    connected: true,
  }
}

/** Which networks are connected. Deliberately returns no tokens. */
export async function listAdsConnections(admin: AnyClient): Promise<StoredAdsToken[]> {
  const { data } = await admin.from(TOKENS).select('*').order('platform_id', { ascending: true })
  return (data || []).map(view)
}

/** Mirror the expiry onto the health row so the watcher sees it without a second source. */
async function syncExpiryToHealth(admin: AnyClient, platformId: string, accountRef: string | null, expiresAt: string | null) {
  if (!accountRef) return
  try {
    await admin.from(HEALTH).upsert(
      {
        platform_id: platformId,
        account_ref: accountRef,
        token_expires_at: expiresAt,
        token_source: 'oauth',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'platform_id,account_ref' },
    )
  } catch {
    // A health row that could not be written must not break the spend path. The token is
    // still valid; only the warning is lost, and the next renewal will write it again.
  }
}

export async function saveAdsConnection(
  admin: AnyClient,
  input: {
    platformId: string
    accessToken: string
    refreshToken?: string | null
    expiresAt?: string | null
    accountRef?: string | null
    scopes?: string[]
    connectedBy?: string | null
  },
): Promise<{ ok: boolean; error?: string }> {
  const platformId = String(input.platformId || '').trim()
  if (!platformId || !String(input.accessToken || '').trim()) {
    return { ok: false, error: 'A network and an access token are both required.' }
  }

  const { error } = await admin.from(TOKENS).upsert(
    {
      platform_id: platformId,
      access_token: input.accessToken,
      refresh_token: input.refreshToken || null,
      expires_at: input.expiresAt || null,
      account_ref: input.accountRef || null,
      scopes: input.scopes || [],
      connected_by: input.connectedBy || null,
      updated_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: 'platform_id' },
  )
  if (error) return { ok: false, error: error.message }

  await syncExpiryToHealth(admin, platformId, input.accountRef || null, input.expiresAt || null)
  return { ok: true }
}

export async function deleteAdsConnection(admin: AnyClient, platformId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await admin.from(TOKENS).delete().eq('platform_id', String(platformId || '').trim())
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * A token that is valid right now, or an honest failure.
 *
 * Order matters here. The stored connection wins over the environment variable, because a
 * stored one can be renewed and an env var cannot — if both exist, the env var is the older
 * arrangement and following it would defeat the point of connecting.
 */
export async function getValidAdsToken(
  admin: AnyClient,
  platformId: string,
  envFallback?: string,
): Promise<ResolvedToken> {
  const id = String(platformId || '').trim()

  let row: any = null
  try {
    const { data } = await admin.from(TOKENS).select('*').eq('platform_id', id).maybeSingle()
    row = data || null
  } catch {
    row = null
  }

  if (!row) {
    if (envFallback) return { ok: true, accessToken: envFallback, expiresAt: null, renewed: false }
    return { ok: false, reason: `${id} is not connected. Connect it from the ads cockpit, or set its access token in the environment.` }
  }

  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0
  const needsRenewal = expiresAt > 0 && expiresAt - Date.now() < RENEW_WITHIN_MS

  if (!needsRenewal) {
    return { ok: true, accessToken: String(row.access_token), expiresAt: row.expires_at || null, renewed: false }
  }

  if (!row.refresh_token) {
    // Meta hands out no refresh token; a long-lived token is traded for a fresh long-lived
    // one instead, which is the same idea under a different name.
    if (id === 'meta_ads') {
      const traded = await exchangeMetaLongLivedToken(String(row.access_token))
      if (traded.ok === true) {
        await saveAdsConnection(admin, {
          platformId: id,
          accessToken: traded.accessToken,
          refreshToken: null,
          expiresAt: traded.expiresAt,
          accountRef: row.account_ref,
          scopes: Array.isArray(row.scopes) ? row.scopes : [],
          connectedBy: row.connected_by,
        })
        return { ok: true, accessToken: traded.accessToken, expiresAt: traded.expiresAt, renewed: true }
      }
      await recordRenewalFailure(admin, id, (traded as any).reason)
      return { ok: false, reason: `${id} could not renew: ${(traded as any).reason}` }
    }

    await recordRenewalFailure(admin, id, 'expired with no refresh token')
    return { ok: false, reason: `${id} expired and has no refresh token — reconnect the account.` }
  }

  const renewed = await refreshAdsToken(id, String(row.refresh_token))
  if (renewed.ok !== true) {
    await recordRenewalFailure(admin, id, (renewed as any).reason)
    // Deliberately not returning the expired token. A call that looks authorised and fails
    // at the network gets blamed on the campaign, which is the wrong thing to fix.
    return { ok: false, reason: `${id} could not renew: ${(renewed as any).reason}` }
  }

  await saveAdsConnection(admin, {
    platformId: id,
    accessToken: renewed.accessToken,
    refreshToken: renewed.refreshToken,
    expiresAt: renewed.expiresAt,
    accountRef: row.account_ref,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    connectedBy: row.connected_by,
  })

  return { ok: true, accessToken: renewed.accessToken, expiresAt: renewed.expiresAt, renewed: true }
}

async function recordRenewalFailure(admin: AnyClient, platformId: string, reason: string) {
  try {
    await admin
      .from(TOKENS)
      .update({ last_error: String(reason).slice(0, 500), updated_at: new Date().toISOString() })
      .eq('platform_id', platformId)
  } catch {
    // Recording the reason is a courtesy; failing to record it must not mask the failure
    // itself, which is already being returned to the caller.
  }
}
