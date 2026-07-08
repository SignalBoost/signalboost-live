import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ADAPTERS, SOCIAL_CONNECTORS, type SocialPlatform } from '@/lib/outreach/social-connectors'

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function isPlatform(value: string): value is SocialPlatform {
  return Boolean((SOCIAL_CONNECTORS as any)[value])
}

function creds(platform: SocialPlatform) {
  const prefix = `SOCIAL_${platform.toUpperCase()}`
  return { id: process.env[`${prefix}_CLIENT_ID`], secret: process.env[`${prefix}_CLIENT_SECRET`] }
}

function dashboardUrl(origin: string, params: Record<string, string>) {
  const search = new URLSearchParams(params)
  return `${origin}/dashboard/outreach/social?${search.toString()}`
}

async function exchangeCode(args: { platform: SocialPlatform; code: string; redirectUri: string }) {
  const adapter = ADAPTERS[args.platform]
  const tokenUrl = adapter.tokenUrl
  if (!tokenUrl) throw new Error(`${args.platform}_token_exchange_not_supported`)

  const { id, secret } = creds(args.platform)
  if (!id) throw new Error(`${args.platform}_client_id_not_configured`)
  if (!secret && args.platform !== 'twitter_x') throw new Error(`${args.platform}_client_secret_not_configured`)

  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: args.code,
    redirect_uri: args.redirectUri,
  })

  if (args.platform === 'reddit') {
    if (!secret) throw new Error('reddit_client_secret_not_configured')
    headers.Authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`
  } else if (args.platform === 'tiktok') {
    body.set('client_key', id)
    if (secret) body.set('client_secret', secret)
  } else {
    body.set('client_id', id)
    if (secret) body.set('client_secret', secret)
  }

  const res = await fetch(tokenUrl, { method: 'POST', headers, body, cache: 'no-store' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error || !data.access_token) throw new Error(data.error_description || data.error_message || data.error || `${args.platform}_token_exchange_failed_${res.status}`)
  return data
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const errorParam = searchParams.get('error')

  if (errorParam) return NextResponse.redirect(dashboardUrl(origin, { social_error: errorParam }))
  if (!code || !state) return NextResponse.redirect(dashboardUrl(origin, { social_error: 'missing_code_or_state' }))

  const parts = state.split(':')
  if (parts.length < 3) return NextResponse.redirect(dashboardUrl(origin, { social_error: 'invalid_state' }))
  const userId = parts[0]
  const platform = parts[1]
  if (!isPlatform(platform)) return NextResponse.redirect(dashboardUrl(origin, { social_error: 'unsupported_platform' }))

  const adapter = ADAPTERS[platform]
  const redirectUri = `${origin}/api/outreach/social/oauth/callback`

  let tokenData: any
  try {
    tokenData = await exchangeCode({ platform, code, redirectUri })
  } catch (err: any) {
    return NextResponse.redirect(dashboardUrl(origin, { social_error: err?.message || 'token_exchange_failed', platform }))
  }

  const expiresAt = new Date(Date.now() + Number(tokenData.expires_in || 3600) * 1000).toISOString()
  const scopes = String(tokenData.scope || '').trim() ? String(tokenData.scope).split(/[\s,]+/).filter(Boolean) : adapter.scopes

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
  const { error: upsertError } = await admin.from('outreach_social_tokens').upsert(
    {
      user_id: userId,
      platform,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      expires_at: expiresAt,
      scopes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,platform' },
  )

  if (upsertError) return NextResponse.redirect(dashboardUrl(origin, { social_error: upsertError.message, platform }))
  return NextResponse.redirect(dashboardUrl(origin, { social_connected: platform }))
}
