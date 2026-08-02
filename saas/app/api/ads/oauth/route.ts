// saas/app/api/ads/oauth/route.ts
//
// CONNECTING AN AD NETWORK, THE WAY THE SOCIAL CONNECTOR ALREADY DOES.
//
// Two jobs in one handler, distinguished by what the request carries:
//
//   ?platform=meta_ads   → send the operator to the network's consent screen
//   ?code=…&state=…      → the network sending them back, with a grant
//
// WHY THIS EXISTS AT ALL. The ads surface began by reading access tokens from environment
// variables, which cannot renew themselves. Meta and LinkedIn tokens last about sixty days,
// Pinterest thirty, and TikTok, Snapchat and Reddit issue tokens measured in hours. Every
// one of those connections would have died quietly a few weeks after setup, and a dead ads
// connection looks exactly like a campaign that finished.
//
// THE STATE PARAMETER IS NOT DECORATION. It is stored in an httpOnly cookie and compared on
// the way back, so a link someone was sent cannot attach a stranger's ad account — an
// account that can spend money. A mismatch is refused outright rather than warned about.
//
// OWNER-GATED ON BOTH LEGS. The callback is as privileged as the start: it is the request
// that actually stores a credential capable of spending.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import {
  buildAdsOAuthUrl,
  exchangeAdsCode,
  exchangeMetaLongLivedToken,
  supportsAdsOAuth,
  adsOAuthGrants,
} from '@/lib/ads/ads-oauth'
import { saveAdsConnection } from '@/lib/ads/ads-token-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATE_COOKIE = 'ads_oauth_state'
const COCKPIT = '/dashboard/ads'

function redirectUriFor(req: NextRequest): string {
  // Built from the request rather than an environment variable so preview deployments work
  // without a second configuration step. The network compares it byte for byte against the
  // registered one, so it must be exactly what was registered.
  const configured = String(process.env.ADS_OAUTH_REDIRECT_URI || '').trim()
  if (configured) return configured
  return `${req.nextUrl.origin}/api/ads/oauth`
}

function backToCockpit(req: NextRequest, params: Record<string, string>): NextResponse {
  const url = new URL(COCKPIT, req.nextUrl.origin)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const code = String(req.nextUrl.searchParams.get('code') || '')
  const returnedState = String(req.nextUrl.searchParams.get('state') || '')
  const networkError = String(req.nextUrl.searchParams.get('error') || '')

  // ── The network sent them back ────────────────────────────────────────────
  if (code || returnedState || networkError) {
    if (networkError) {
      // The network's own words, not ours. "Access denied" from Meta means something
      // different from "app not approved", and paraphrasing loses that.
      return backToCockpit(req, { connect_failed: networkError.slice(0, 160) })
    }

    const cookie = req.cookies.get(STATE_COOKIE)?.value || ''
    const [expectedState, platformId] = cookie.split(':')
    if (!expectedState || !returnedState || expectedState !== returnedState) {
      return backToCockpit(req, {
        connect_failed: 'The authorisation did not match the request that started it. Start the connection again from this page.',
      })
    }

    const exchanged = (await exchangeAdsCode(platformId, code, redirectUriFor(req))) as {
      ok: boolean
      accessToken?: string
      refreshToken?: string | null
      expiresAt?: string | null
      reason?: string
    }
    if (exchanged.ok !== true) {
      return backToCockpit(req, { connect_failed: String(exchanged.reason).slice(0, 200) })
    }

    let accessToken = String(exchanged.accessToken)
    let expiresAt = exchanged.expiresAt || null

    // Meta hands back a short-lived token here. Without this second call the connection
    // works for about an hour and then stops, which reads as a broken integration rather
    // than a missing step.
    if (platformId === 'meta_ads') {
      const longLived = (await exchangeMetaLongLivedToken(accessToken)) as {
        ok: boolean; accessToken?: string; expiresAt?: string | null; reason?: string
      }
      if (longLived.ok === true) {
        accessToken = String(longLived.accessToken)
        expiresAt = longLived.expiresAt || null
      }
      // A failed trade is not fatal — the short-lived token still works today, and the store
      // will try the trade again on the next read rather than losing the connection now.
    }

    const saved = await saveAdsConnection(ctx.admin, {
      platformId,
      accessToken,
      refreshToken: exchanged.refreshToken || null,
      expiresAt,
      connectedBy: String(ctx.user?.email || ctx.user?.id || 'unknown'),
    })
    if (!saved.ok) return backToCockpit(req, { connect_failed: String(saved.error).slice(0, 200) })

    await auditAdminAction({
      admin: ctx.admin,
      actorId: String(ctx.user?.id || ''),
      action: 'ads.network.connect',
      targetType: 'ad_network',
      targetId: platformId,
      // No token material, ever. That an account capable of spending was connected, by whom,
      // and what it was granted — that is the whole useful record.
      metadata: { grants: adsOAuthGrants(platformId), expiresAt },
    })

    const response = backToCockpit(req, { connected: platformId })
    response.cookies.delete(STATE_COOKIE)
    return response
  }

  // ── Starting a connection ─────────────────────────────────────────────────
  const platformId = String(req.nextUrl.searchParams.get('platform') || '').trim()
  if (!platformId) return NextResponse.json({ error: 'platform is required.' }, { status: 400 })

  if (!supportsAdsOAuth(platformId)) {
    return NextResponse.json(
      {
        error: `${platformId} does not connect over OAuth 2. X Ads needs OAuth 1.0a request signing and Microsoft Advertising uses its own identity flow — both are reached through the endpoint you run for them.`,
      },
      { status: 400 },
    )
  }

  const state = crypto.randomUUID()
  const built = buildAdsOAuthUrl(platformId, redirectUriFor(req), state)
  if (!built.ok || !built.url) {
    return NextResponse.json({ error: built.reason || 'Could not build the authorisation URL.' }, { status: 400 })
  }

  const response = NextResponse.redirect(built.url)
  response.cookies.set(STATE_COOKIE, `${state}:${platformId}`, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  return response
}
