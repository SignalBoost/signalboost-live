import { NextRequest, NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'

function getSafeRedirectPath(next: string | null): string {
  const defaultPath = '/dashboard'
  if (!next) return defaultPath
  // Only allow relative paths that start with '/' but not '//'
  // (protocol-relative URLs like //attacker.com would be resolved externally)
  if (next.startsWith('/') && !next.startsWith('//')) {
    return next
  }
  return defaultPath
}

export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url)
  const code = requestUrl.searchParams.get('code')
  const next = getSafeRedirectPath(requestUrl.searchParams.get('next'))

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', requestUrl.origin))
  }

  const supabase = await createMarketingServerSupabase()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('Marketing OAuth callback error:', error)
    return NextResponse.redirect(new URL('/login?error=auth_failed', requestUrl.origin))
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin))
}
