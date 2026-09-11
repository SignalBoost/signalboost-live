import { NextRequest, NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'

export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url)
  const code = requestUrl.searchParams.get('code')
  let next = requestUrl.searchParams.get('next') || '/dashboard'

  // Validate next parameter to prevent open redirect attacks
  // Only allow relative paths starting with '/' but not '//'
  if (!next.startsWith('/') || next.startsWith('//')) {
    next = '/dashboard'
  }

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
