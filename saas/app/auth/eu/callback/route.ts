import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { euCustomerLaunchReadiness } from '@/lib/security/euCustomerLaunchReadiness.ts'

export const runtime = 'nodejs'

/** EU-only PKCE callback. Never exchange EU codes against the US Auth project. */
export async function GET(req: NextRequest) {
  const readiness = euCustomerLaunchReadiness()
  if (!readiness.ready) {
    return NextResponse.json({ error: 'eu_auth_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/?error=missing_code', url.origin))
  // Do not accept an untrusted next= URL or route to the US-only onboarding workflow.
  const response = NextResponse.redirect(new URL('/eu/account', url.origin))
  const eu = createServerClient(process.env.EU_SUPABASE_URL!, process.env.EU_SUPABASE_ANON_KEY!, {
    cookieOptions: { name: 'itmounts-eu-auth', path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
    cookies: {
      getAll: () => req.cookies.getAll().filter(cookie => cookie.name.startsWith('itmounts-eu-auth')),
      setAll: list => list.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  })
  const { error } = await eu.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(new URL('/?error=eu_auth_failed', url.origin))
  response.headers.set('Cache-Control', 'no-store')
  return response
}
