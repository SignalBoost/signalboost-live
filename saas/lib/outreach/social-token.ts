// saas/lib/outreach/social-token.ts
// Returns a valid access token for a connected social platform, refreshing it
// from the stored refresh_token when expired. Honest failures: if there's no
// connection or no way to refresh, it says so — it never returns a stale token
// and never fakes a publish-ready connection.

import { refreshSocialToken, type SocialPlatform } from './social-connectors'

export type ValidSocialToken = {
  ok: boolean
  accessToken?: string
  accountRef?: string | null
  accountName?: string | null
  error?: string
}

export async function getValidSocialToken(
  admin: any,
  userId: string,
  platform: SocialPlatform,
): Promise<ValidSocialToken> {
  try {
    const { data, error } = await admin
      .from('outreach_social_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platform)
      .single()

    if (error || !data) return { ok: false, error: `${platform} is not connected for this user.` }

    const accountRef = data.account_ref ? String(data.account_ref) : null
    const accountName = data.account_name ? String(data.account_name) : null
    const stillValid = data.expires_at && new Date(data.expires_at).getTime() > Date.now() + 60_000
    if (stillValid && data.access_token) return { ok: true, accessToken: data.access_token, accountRef, accountName }

    if (!data.refresh_token) {
      return { ok: false, error: `${platform} token expired and has no refresh token — reconnect the account.` }
    }

    const fresh = await refreshSocialToken(platform, data.refresh_token)
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString()
    await admin.from('outreach_social_tokens').upsert(
      {
        user_id: userId,
        platform,
        access_token: fresh,
        refresh_token: data.refresh_token,
        account_ref: accountRef,
        account_name: accountName,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,platform' },
    )
    return { ok: true, accessToken: fresh, accountRef, accountName }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'token load failed' }
  }
}
