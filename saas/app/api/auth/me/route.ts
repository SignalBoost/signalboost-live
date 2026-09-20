import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

function isTransientAuthError(error: unknown): boolean {
  const status = Number((error as { status?: number } | null)?.status || 0)
  return status === 0 || status === 408 || status === 429 || status >= 500
}

export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          },
        },
      }
    )

    const { data: claimsData, error: authError } = await supabase.auth.getClaims()
    if (authError && isTransientAuthError(authError)) {
      return NextResponse.json(
        { error: 'auth_temporarily_unavailable' },
        { status: 503, headers: { 'Retry-After': '2' } },
      )
    }
    if (authError) return NextResponse.json({ isAdmin: false, isOwner: false, role: 'guest', plan: 'free', tier: 'free' })

    const claims = claimsData?.claims as { sub?: string; email?: string } | undefined
    const userId = String(claims?.sub || '').trim()
    if (!userId) return NextResponse.json({ isAdmin: false, isOwner: false, role: 'guest', plan: 'free', tier: 'free' })

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('user_id', userId)
      .maybeSingle()

    const plan = sub?.plan || 'free'
    const ownerEmails = (process.env.OWNER_EMAILS || '').split(',').map(e => e.trim().toLowerCase())
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase())
    const email = String(claims?.email || '').toLowerCase()
    const isOwner = ownerEmails.includes(email)
    const isAdmin = isOwner || adminEmails.includes(email)

    return NextResponse.json({ isAdmin, isOwner, role: isOwner ? 'owner' : isAdmin ? 'admin' : 'user', plan, tier: plan })
  } catch {
    return NextResponse.json(
      { error: 'auth_temporarily_unavailable' },
      { status: 503, headers: { 'Retry-After': '2' } },
    )
  }
}
