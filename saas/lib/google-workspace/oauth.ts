// Read-only Google Workspace OAuth for Google Sheets + Drive metadata.
// Tokens are exchanged here but persisted only through the encrypted token store.

export const GOOGLE_WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
] as const

export function missingGoogleWorkspaceScopes(scopes: readonly string[]): string[] {
  const granted = new Set(scopes.map(scope => String(scope || '').trim()).filter(Boolean))
  return GOOGLE_WORKSPACE_SCOPES.filter(scope => !granted.has(scope))
}

export function hasRequiredGoogleWorkspaceScopes(scopes: readonly string[]): boolean {
  return missingGoogleWorkspaceScopes(scopes).length === 0
}

export type GoogleWorkspaceTokenResult =
  | { ok: true; accessToken: string; refreshToken: string | null; expiresAt: string; scopes: string[] }
  | { ok: false; reason: string }

function credentials(env: NodeJS.ProcessEnv = process.env) {
  return {
    clientId: String(env.GOOGLE_WORKSPACE_CLIENT_ID || '').trim(),
    clientSecret: String(env.GOOGLE_WORKSPACE_CLIENT_SECRET || '').trim(),
  }
}

export function googleWorkspaceOAuthConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const { clientId, clientSecret } = credentials(env)
  return Boolean(clientId && clientSecret && String(env.VAULT_MASTER_KEY || '').trim().length === 64)
}

export function buildGoogleWorkspaceOAuthUrl(
  redirectUri: string,
  state: string,
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; url: string } | { ok: false; reason: string } {
  const { clientId } = credentials(env)
  if (!clientId) return { ok: false, reason: 'GOOGLE_WORKSPACE_CLIENT_ID is not configured.' }
  if (!redirectUri) return { ok: false, reason: 'Google Workspace OAuth redirect URI is unavailable.' }
  if (!state) return { ok: false, reason: 'OAuth state is required.' }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_WORKSPACE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return { ok: true, url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` }
}

async function tokenRequest(
  params: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleWorkspaceTokenResult> {
  const { clientId, clientSecret } = credentials(env)
  if (!clientId || !clientSecret) {
    return { ok: false, reason: 'GOOGLE_WORKSPACE_CLIENT_ID and GOOGLE_WORKSPACE_CLIENT_SECRET must both be configured.' }
  }

  let response: Response
  try {
    response = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...params, client_id: clientId, client_secret: clientSecret }).toString(),
      signal: AbortSignal.timeout(12_000),
    })
  } catch (error) {
    return { ok: false, reason: `Google token request failed: ${error instanceof Error ? error.message : String(error)}` }
  }

  const raw = await response.text()
  if (!response.ok) return { ok: false, reason: `Google refused the token request (${response.status}): ${raw.slice(0, 200)}` }

  let payload: any
  try { payload = JSON.parse(raw) } catch { return { ok: false, reason: 'Google returned a non-JSON token response.' } }
  const accessToken = String(payload?.access_token || '').trim()
  const expiresIn = Math.max(1, Number(payload?.expires_in || 3600))
  if (!accessToken) return { ok: false, reason: 'Google returned no access token.' }

  return {
    ok: true,
    accessToken,
    refreshToken: payload?.refresh_token ? String(payload.refresh_token) : null,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    scopes: String(payload?.scope || '').split(/\s+/).filter(Boolean),
  }
}

export async function exchangeGoogleWorkspaceCode(
  code: string,
  redirectUri: string,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleWorkspaceTokenResult> {
  if (!code) return { ok: false, reason: 'Google authorization code is missing.' }
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }, env, fetchImpl)
}

export async function refreshGoogleWorkspaceToken(
  refreshToken: string,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleWorkspaceTokenResult> {
  if (!refreshToken) return { ok: false, reason: 'Google refresh token is missing.' }
  const result = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken }, env, fetchImpl)
  if (!result.ok) return result
  return { ...result, refreshToken: result.refreshToken || refreshToken }
}
