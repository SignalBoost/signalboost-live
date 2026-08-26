import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/utils/supabase/server.ts'
import {
  buildGoogleWorkspaceOAuthUrl,
  exchangeGoogleWorkspaceCode,
  googleWorkspaceOAuthConfigured,
} from '@/lib/google-workspace/oauth.ts'
import { saveGoogleWorkspaceConnection } from '@/lib/google-workspace/token-store.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATE_COOKIE = 'google_workspace_oauth_state'
const BACK = '/dashboard/data'

function redirectUriFor(req: NextRequest): string {
  const configured = String(process.env.GOOGLE_WORKSPACE_REDIRECT_URI || '').trim()
  return configured || `${req.nextUrl.origin}/api/integrations/google-sheets/oauth`
}

function back(req: NextRequest, params: Record<string, string>): NextResponse {
  const url = new URL(BACK, req.nextUrl.origin)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  const code = String(req.nextUrl.searchParams.get('code') || '')
  const returnedState = String(req.nextUrl.searchParams.get('state') || '')
  const googleError = String(req.nextUrl.searchParams.get('error') || '')

  if (code || returnedState || googleError) {
    if (googleError) return back(req, { google_sheets_error: googleError.slice(0, 160) })
    const cookie = req.cookies.get(STATE_COOKIE)?.value || ''
    const separator = cookie.indexOf(':')
    const expectedState = separator >= 0 ? cookie.slice(0, separator) : ''
    const expectedUser = separator >= 0 ? cookie.slice(separator + 1) : ''
    if (!expectedState || expectedState !== returnedState || expectedUser !== user.id) {
      return back(req, { google_sheets_error: 'OAuth state did not match. Start the Google Sheets connection again.' })
    }

    const exchanged = await exchangeGoogleWorkspaceCode(code, redirectUriFor(req))
    if (!exchanged.ok) return back(req, { google_sheets_error: exchanged.reason.slice(0, 200) })
    const saved = await saveGoogleWorkspaceConnection({
      userId: user.id,
      accessToken: exchanged.accessToken,
      refreshToken: exchanged.refreshToken,
      expiresAt: exchanged.expiresAt,
      scopes: exchanged.scopes,
    })
    if (!saved.ok) return back(req, { google_sheets_error: saved.reason.slice(0, 200) })

    const response = back(req, { google_sheets: 'connected' })
    response.cookies.delete(STATE_COOKIE)
    return response
  }

  if (!googleWorkspaceOAuthConfigured()) {
    return NextResponse.json({
      error: 'Google Sheets OAuth is not configured yet. GOOGLE_WORKSPACE_CLIENT_ID, GOOGLE_WORKSPACE_CLIENT_SECRET, and VAULT_MASTER_KEY are required.',
    }, { status: 503 })
  }

  const state = crypto.randomUUID()
  const built = buildGoogleWorkspaceOAuthUrl(redirectUriFor(req), state)
  if (!built.ok) return NextResponse.json({ error: built.reason }, { status: 503 })

  const response = NextResponse.redirect(built.url)
  response.cookies.set(STATE_COOKIE, `${state}:${user.id}`, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  return response
}
