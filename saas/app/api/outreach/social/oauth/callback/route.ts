import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const errorParam = searchParams.get('error')

  if (errorParam) {
    return NextResponse.redirect(`${origin}/dashboard/outreach?social_error=${encodeURIComponent(errorParam)}`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${origin}/dashboard/outreach?social_error=missing_code_or_state`)
  }

  // state = userId:platform:timestamp
  const parts = state.split(':')
  if (parts.length < 3) {
    return NextResponse.redirect(`${origin}/dashboard/outreach?social_error=invalid_state`)
  }
  const userId = parts[0]
  const platform = parts[1]

  // Only YouTube OAuth is handled here for now; other platforms use their own SDKs
  if (platform !== 'youtube_channels') {
    return NextResponse.redirect(`${origin}/dashboard/outreach?social_error=unsupported_platform`)
  }

  const clientId = process.env.SOCIAL_YOUTUBE_CHANNELS_CLIENT_ID
  const clientSecret = process.env.SOCIAL_YOUTUBE_CHANNELS_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/dashboard/outreach?social_error=youtube_not_configured`)
  }

  const redirectUri = `${origin}/api/outreach/social/oauth/callback`

  // Exchange authorization code for tokens
  let tokenData: any
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    tokenData = await tokenRes.json()
    if (!tokenRes.ok || tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error || 'token_exchange_failed')
    }
  } catch (err: any) {
    return NextResponse.redirect(`${origin}/dashboard/outreach?social_error=${encodeURIComponent(err.message || 'token_exchange_failed')}`)
  }

  const { access_token, refresh_token, expires_in } = tokenData
  const expiresAt = new Date(Date.now() + (expires_in || 3600) * 1000).toISOString()

  // Store tokens in Supabase (outreach_social_tokens table)
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { error: upsertError } = await admin
    .from('outreach_social_tokens')
    .upsert(
      {
        user_id: userId,
        platform,
        access_token,
        refresh_token: refresh_token || null,
        expires_at: expiresAt,
        scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,platform' }
    )

  if (upsertError) {
    return NextResponse.redirect(`${origin}/dashboard/outreach?social_error=${encodeURIComponent(upsertError.message)}`)
  }

  return NextResponse.redirect(`${origin}/dashboard/outreach?social_connected=youtube_channels`)
}
