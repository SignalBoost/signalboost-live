// saas/lib/ads/ads-oauth.ts
//
// OAUTH FOR THE AD NETWORKS, SO A TOKEN STOPS BEING A STATIC SECRET.
//
// The ads surface shipped reading ten access tokens from environment variables, and that is
// wrong for almost every network here. Meta and LinkedIn tokens last about sixty days.
// Pinterest is around thirty. TikTok, Snapchat and Reddit issue access tokens measured in
// hours with a refresh token beside them. So a network configured today quietly stops
// spending in a few weeks, and the failure looks exactly like a campaign that finished.
//
// The social connector already solved this properly. This is the same machinery for ads,
// declared per network rather than hand-written per network, because the differences between
// them are all data: which URL, which scopes, whether the client credentials go in the body
// or in a Basic header, and where the response hides the token.
//
// CREDENTIALS COME FROM A RESOLVER, not from process.env directly. A buyer keeps their
// client secrets in their own vault and installs one function; install nothing and it falls
// back to the environment, which is the right default for a trial and the wrong one for
// production.
//
// WHAT THIS FILE WILL NOT DO. X Ads is absent: its API needs OAuth 1.0a request signing,
// which is not this protocol. Microsoft Advertising is absent for the same reason its
// campaign API is — it is SOAP, with its own identity flow. Both are reached through the
// buyer-run endpoints declared in ads-google-and-marketplace.ts, and pretending they fit
// here would produce a connect button that cannot work.

export type AdsSecretsResolver = (name: string) => string | undefined

let resolver: AdsSecretsResolver | null = null

/** Install a vault lookup. A buyer calls this once at startup; we never see the secret. */
export function setAdsSecretsResolver(next: AdsSecretsResolver | null): void {
  resolver = next
}

export function getAdsSecret(name: string): string | undefined {
  if (resolver) {
    try {
      const found = resolver(name)
      if (found) return found
    } catch {
      // A broken resolver must not take the environment fallback down with it.
    }
  }
  const env = (globalThis as any)?.process?.env
  return env ? env[name] : undefined
}

/** meta_ads → ADS_META_CLIENT_ID / ADS_META_CLIENT_SECRET. */
export function adsCredentialNames(networkId: string): { clientId: string; clientSecret: string } {
  const base = `ADS_${String(networkId).replace(/_ads$/, '').toUpperCase()}`
  return { clientId: `${base}_CLIENT_ID`, clientSecret: `${base}_CLIENT_SECRET` }
}

type OAuthDeclaration = {
  authUrl: string
  tokenUrl: string
  scopes: string[]
  /** Where the client id and secret go when exchanging or refreshing. */
  clientAuth: 'body' | 'basic'
  /** Some networks want JSON rather than form encoding. */
  tokenBody: 'form' | 'json'
  accessTokenPath: string
  refreshTokenPath?: string
  /** Seconds until expiry, as the network reports it. */
  expiresInPath?: string
  /** Fixed lifetime for networks that do not say. Null means we genuinely do not know. */
  assumeLifetimeSeconds?: number | null
  extraAuthParams?: Record<string, string>
  extraTokenParams?: Record<string, string>
  headers?: Record<string, string>
  /** Named so the connect screen can tell a buyer what they are about to grant. */
  grants: string
}

const OAUTH: Record<string, OAuthDeclaration> = {
  meta_ads: {
    authUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
    scopes: ['ads_management', 'ads_read', 'business_management'],
    clientAuth: 'body',
    tokenBody: 'form',
    accessTokenPath: 'access_token',
    expiresInPath: 'expires_in',
    // Meta returns a short-lived token here; the store exchanges it for a long-lived one,
    // which is roughly sixty days. Recorded rather than assumed to be forever.
    assumeLifetimeSeconds: 60 * 24 * 3600,
    grants: 'create and manage campaigns, read spend, pause',
  },
  linkedin_ads: {
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scopes: ['r_ads', 'rw_ads', 'r_ads_reporting'],
    clientAuth: 'body',
    tokenBody: 'form',
    accessTokenPath: 'access_token',
    refreshTokenPath: 'refresh_token',
    expiresInPath: 'expires_in',
    grants: 'create and manage campaigns, read reporting',
  },
  google_ads: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/adwords'],
    clientAuth: 'body',
    tokenBody: 'form',
    accessTokenPath: 'access_token',
    refreshTokenPath: 'refresh_token',
    expiresInPath: 'expires_in',
    // Without both of these Google returns no refresh token, and the connection dies in an
    // hour with nothing to renew it. This is the single most common OAuth mistake here.
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    grants: 'create and manage campaigns, read cost reporting',
  },
  tiktok_ads: {
    authUrl: 'https://business-api.tiktok.com/portal/auth',
    tokenUrl: 'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/',
    scopes: [],
    clientAuth: 'body',
    tokenBody: 'json',
    accessTokenPath: 'data.access_token',
    refreshTokenPath: 'data.refresh_token',
    expiresInPath: 'data.expires_in',
    grants: 'create and manage campaigns, read reporting',
  },
  reddit_ads: {
    authUrl: 'https://www.reddit.com/api/v1/authorize',
    tokenUrl: 'https://www.reddit.com/api/v1/access_token',
    scopes: ['adsread', 'adsedit'],
    clientAuth: 'basic',
    tokenBody: 'form',
    accessTokenPath: 'access_token',
    refreshTokenPath: 'refresh_token',
    expiresInPath: 'expires_in',
    extraAuthParams: { duration: 'permanent' },
    grants: 'create and manage campaigns, read reporting',
  },
  pinterest_ads: {
    authUrl: 'https://www.pinterest.com/oauth/',
    tokenUrl: 'https://api.pinterest.com/v5/oauth/token',
    scopes: ['ads:read', 'ads:write'],
    clientAuth: 'basic',
    tokenBody: 'form',
    accessTokenPath: 'access_token',
    refreshTokenPath: 'refresh_token',
    expiresInPath: 'expires_in',
    grants: 'create and manage campaigns, read analytics',
  },
  snapchat_ads: {
    authUrl: 'https://accounts.snapchat.com/login/oauth2/authorize',
    tokenUrl: 'https://accounts.snapchat.com/login/oauth2/access_token',
    scopes: ['snapchat-marketing-api'],
    clientAuth: 'body',
    tokenBody: 'form',
    accessTokenPath: 'access_token',
    refreshTokenPath: 'refresh_token',
    expiresInPath: 'expires_in',
    grants: 'create and manage campaigns, read stats',
  },
  amazon_ads: {
    authUrl: 'https://www.amazon.com/ap/oa',
    tokenUrl: 'https://api.amazon.com/auth/o2/token',
    scopes: ['advertising::campaign_management'],
    clientAuth: 'body',
    tokenBody: 'form',
    accessTokenPath: 'access_token',
    refreshTokenPath: 'refresh_token',
    expiresInPath: 'expires_in',
    grants: 'create and manage campaigns',
  },
}

export function adsOAuthNetworks(): string[] {
  return Object.keys(OAUTH)
}

export function supportsAdsOAuth(networkId: string): boolean {
  return Boolean(OAUTH[String(networkId)])
}

export function adsOAuthGrants(networkId: string): string | null {
  return OAUTH[String(networkId)]?.grants || null
}

export type AdsTokenResult =
  | { ok: true; accessToken: string; refreshToken: string | null; expiresAt: string | null }
  | { ok: false; reason: string }

type Exchange = {
  ok: boolean
  accessToken: string
  refreshToken: string | null
  expiresAt: string | null
  reason: string
}

function readPath(source: unknown, path: string): unknown {
  let cursor: any = source
  for (const segment of String(path).split('.')) {
    if (cursor === null || cursor === undefined) return undefined
    cursor = cursor[segment]
  }
  return cursor
}

function fail(reason: string): Exchange {
  return { ok: false, accessToken: '', refreshToken: null, expiresAt: null, reason }
}

/**
 * The consent URL to send an operator to.
 *
 * Returns a refusal rather than a broken link when the client credentials are missing,
 * because a connect button that opens a network's error page teaches a buyer that the
 * integration is broken rather than that a variable is unset.
 */
export function buildAdsOAuthUrl(networkId: string, redirectUri: string, state: string): { ok: boolean; url?: string; reason?: string } {
  const declaration = OAUTH[String(networkId)]
  if (!declaration) return { ok: false, reason: `${networkId} does not use OAuth 2 — connect it through the endpoint it requires instead.` }

  const names = adsCredentialNames(networkId)
  const clientId = getAdsSecret(names.clientId)
  if (!clientId) return { ok: false, reason: `${names.clientId} is not set, so there is no application to authorise against.` }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    ...(declaration.extraAuthParams || {}),
  })
  if (declaration.scopes.length) params.set('scope', declaration.scopes.join(declaration.clientAuth === 'basic' ? ' ' : ','))
  // TikTok addresses its own app by app_id rather than the standard parameter name.
  if (networkId === 'tiktok_ads') params.set('app_id', clientId)

  return { ok: true, url: `${declaration.authUrl}?${params.toString()}` }
}

async function callToken(networkId: string, params: Record<string, string>): Promise<Exchange> {
  const declaration = OAUTH[String(networkId)]
  if (!declaration) return fail(`${networkId} does not use OAuth 2.`)

  const names = adsCredentialNames(networkId)
  const clientId = getAdsSecret(names.clientId)
  const clientSecret = getAdsSecret(names.clientSecret)
  if (!clientId || !clientSecret) return fail(`${names.clientId} and ${names.clientSecret} must both be set.`)

  const headers: Record<string, string> = { ...(declaration.headers || {}) }
  const body: Record<string, string> = { ...params }

  if (declaration.clientAuth === 'basic') {
    const encoded = (globalThis as any).btoa
      ? (globalThis as any).btoa(`${clientId}:${clientSecret}`)
      : Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    headers.Authorization = `Basic ${encoded}`
  } else if (networkId === 'tiktok_ads') {
    body.app_id = clientId
    body.secret = clientSecret
  } else {
    body.client_id = clientId
    body.client_secret = clientSecret
  }

  let payload: unknown
  try {
    let init: RequestInit
    if (declaration.tokenBody === 'json') {
      headers['Content-Type'] = 'application/json'
      init = { method: 'POST', headers, body: JSON.stringify(body) }
    } else {
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
      init = { method: 'POST', headers, body: new URLSearchParams(body).toString() }
    }
    const res = await fetch(declaration.tokenUrl, init)
    const raw = await res.text()
    if (!res.ok) return fail(`${networkId} refused the token request (${res.status}): ${raw.slice(0, 200)}`)
    try { payload = JSON.parse(raw) } catch { return fail(`${networkId} returned a token response that is not JSON.`) }
  } catch (error: any) {
    return fail(String(error?.message || error))
  }

  const accessToken = readPath(payload, declaration.accessTokenPath)
  if (!accessToken) return fail(`${networkId} answered without an access token at "${declaration.accessTokenPath}".`)

  const refreshToken = declaration.refreshTokenPath ? readPath(payload, declaration.refreshTokenPath) : null
  const expiresIn = declaration.expiresInPath ? Number(readPath(payload, declaration.expiresInPath)) : NaN
  const seconds = Number.isFinite(expiresIn) && expiresIn > 0
    ? expiresIn
    : (declaration.assumeLifetimeSeconds || 0)

  return {
    ok: true,
    accessToken: String(accessToken),
    refreshToken: refreshToken ? String(refreshToken) : null,
    // Null when the network told us nothing and we have no documented lifetime. Null means
    // unknown, and the watcher treats unknown as unwatchable rather than as safe.
    expiresAt: seconds > 0 ? new Date(Date.now() + seconds * 1000).toISOString() : null,
    reason: '',
  }
}

/** Turn the code from the consent redirect into a stored token. */
export async function exchangeAdsCode(networkId: string, code: string, redirectUri: string): Promise<AdsTokenResult> {
  const result = await callToken(networkId, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    ...(networkId === 'tiktok_ads' ? { auth_code: code } : {}),
  })
  if (!result.ok) return { ok: false, reason: result.reason }
  return { ok: true, accessToken: result.accessToken, refreshToken: result.refreshToken, expiresAt: result.expiresAt }
}

/**
 * Renew from a stored refresh token.
 *
 * A network that returns a NEW refresh token replaces the old one; several rotate them, and
 * keeping the stale one is how a connection dies at the second renewal rather than the
 * first.
 */
export async function refreshAdsToken(networkId: string, refreshToken: string): Promise<AdsTokenResult> {
  const result = await callToken(networkId, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  if (!result.ok) return { ok: false, reason: result.reason }
  return {
    ok: true,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken || refreshToken,
    expiresAt: result.expiresAt,
  }
}

/**
 * Meta issues a short-lived token at the code exchange and expects a second call to trade it
 * for the long-lived one. Skipping this is why a Meta connection appears to work and then
 * stops about an hour later.
 */
export async function exchangeMetaLongLivedToken(shortLivedToken: string): Promise<AdsTokenResult> {
  const result = await callToken('meta_ads', {
    grant_type: 'fb_exchange_token',
    fb_exchange_token: shortLivedToken,
  })
  if (!result.ok) return { ok: false, reason: result.reason }
  return { ok: true, accessToken: result.accessToken, refreshToken: null, expiresAt: result.expiresAt }
}
