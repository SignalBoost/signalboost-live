import { NextRequest, NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'

function isSafeNextPath(next: string) {
  return next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')
}

export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url)
  const code = requestUrl.searchParams.get('code')
  const requestedNext = requestUrl.searchParams.get('next') || '/dashboard'
  const next = isSafeNextPath(requestedNext) ? requestedNext : '/dashboard'

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', requestUrl.origin))
  }

  const supabase = await createMarketingServerSupabase()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('Marketing OAuth callback error: auth_failed')
    return NextResponse.redirect(new URL('/login?error=auth_failed', requestUrl.origin))
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin))
}
