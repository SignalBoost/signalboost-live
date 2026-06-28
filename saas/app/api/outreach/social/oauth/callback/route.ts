// saas/app/api/outreach/social/oauth/callback/route.ts
// Handles the OAuth 2.0 callback from Google (and other providers).
// Exchanges the auth code for access + refresh tokens and stores them
// in the outreach_social_tokens table for later use by publishSocialPost().

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase, getCurrentUser } from '@/utils/supabase/server'
import { SOCIAL_CONNECTORS, SocialPlatform } from '@/lib/outreach/social-connectors'
import { auditAdminAction } from '@/lib/outreach/security'

export const dynamic = 'force-dynamic'

// Token exchange endpoint per provider
const TOKEN_ENDPOINTS: Partial<Record<SocialPlatform, string>> = {
  youtube_channels: 'https://oauth2.googleapis.com/token',
  facebook_pages: 'https://graph.facebook.com/v20.0/oauth/access_token',
  instagram_business: 'https://graph.facebook.com/v20.0/oauth/access_token',
  linkedin_company: 'https://www.linkedin.com/oauth/v2/accessToken',
  twitter_x: 'https://api.twitter.com/2/oauth2/token',
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const errorParam = searchParams.get('error')

  // Provider denied access
  if (errorParam) {
    return NextResponse.redirect(`${origin}/dashboard/outreach?social_auth=denied&reason=${encodeURIComponent(errorParam)}`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${origin}/dashboard/outreach?social_auth=error&reason=missing_params`)
  }

  // State format: userId:platform:timestamp
  const parts = state.split(':')
  if (parts.length < 3) {
    return NextResponse.redirect(`${origin}/dashboard/outreach?social_auth=error&reason=invalid_state`)
  }
  const [userId, platform] = parts
  const socialPlatform = platform as SocialPlatform

  if (!SOCIAL_CONNECTORS[socialPlatform]) {
    return NextResponse.redirect(`${origin}/dashboard/outreach?social_auth=error&reason=unsupported_platform`)
  }

  // Verify the current session user matches the state userId
  const user = await getCurrentUser()
  if (!user || user.id !== userId) {
    return NextResponse.redirect(`${origin}/dashboard/outreach?social_auth=error&reason=user_mismatch`)
  }

  const clientIdKey = `SOCIAL_${socialPlatform.toUpperCase()}_CLIENT_ID`
  const clientSecretKey = `SOCIAL_${socialPlatform.toUpperCase()}_CLIENT_SECRET`
  const clientId = process.env[clientIdKey]
  const clientSecret = process.env[clientSecretKey]

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      `${origin}/dashboard/outreach?social_auth=error&reason=credentials_not_configured&platform=${socialPlatform}`
    )
  }

  const tokenEndpoint = TOKEN_ENDPOINTS[socialPlatform]
  if (!tokenEndpoint) {
    return NextResponse.redirect(`${origin}/dashboard/outreach?social_auth=error&reason=no_token_endpoint`)
  }

  const redirectUri = `${origin}/api/outreach/social/oauth/callback`

  // Exchange auth code for tokens
  let tokenData: any
  try {
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    })

    const tokenRes = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    tokenData = await tokenRes.json()

    if (!tokenRes.ok || tokenData.error) {
      const reason = tokenData.error_description || tokenData.error || 'token_exchange_failed'
      return NextResponse.redirect(
        `${origin}/dashboard/outreach?social_auth=error&reason=${encodeURIComponent(reason)}&platform=${socialPlatform}`
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'fetch_failed'
    return NextResponse.redirect(
      `${origin}/dashboard/outreach?social_auth=error&reason=${encodeURIComponent(msg)}&platform=${socialPlatform}`
    )
  }

  const accessToken: string = tokenData.access_token || ''
  const refreshToken: string = tokenData.refresh_token || ''
  const expiresIn: number = tokenData.expires_in || 3600
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  if (!accessToken) {
    return NextResponse.redirect(
      `${origin}/dashboard/outreach?social_auth=error&reason=no_access_token&platform=${socialPlatform}`
    )
  }

  // Persist tokens in Supabase using service-role client
  const admin = getAdminSupabase()

  // Upsert: one token row per user+platform
  const { error: upsertError } = await admin
    .from('outreach_social_tokens')
    .upsert(
      {
        user_id: userId,
        platform: socialPlatform,
        access_token: accessToken,
        refresh_token: refreshToken || null,
        expires_at: expiresAt,
        scopes: SOCIAL_CONNECTORS[socialPlatform].scopes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,platform' }
    )

  if (upsertError) {
    return NextResponse.redirect(
      `${origin}/dashboard/outreach?social_auth=error&reason=${encodeURIComponent(upsertError.message)}&platform=${socialPlatform}`
    )
  }

  await auditAdminAction({
    admin,
    actorId: userId,
    action: 'outreach.social.oauth_complete',
    targetType: 'social_connector',
    targetId: socialPlatform,
    metadata: { expiresAt, hasRefreshToken: !!refreshToken },
  })

  return NextResponse.redirect(
    `${origin}/dashboard/outreach?social_auth=success&platform=${socialPlatform}`
  )
}
