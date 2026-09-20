import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { cookies } from 'next/headers'
import { getCreditState } from '@/lib/credits'
import { accessFromVerifiedIdentity } from '@/lib/auth/access'

// Role and credit state are per-session — never let this be cached.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookieOptions: saasSupabaseCookieOptions,
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // Called from a Server Component — safe to ignore
            }
          },
        },
      }
    )

    const { data: claimsData, error: authError } = await supabase.auth.getClaims()
    if (authError) {
      const status = Number((authError as { status?: number }).status || 0)
      if (status === 0 || status === 408 || status === 429 || status >= 500) {
        return NextResponse.json(
          { error: 'auth_temporarily_unavailable' },
          { status: 503, headers: { 'Retry-After': '2' } },
        )
      }
      return NextResponse.json(
        { credits: 0, plan: 'free', name: null, role: 'guest', isAdmin: false, isOwner: false },
        { status: 401 },
      )
    }

    const claims = claimsData?.claims as { sub?: string; email?: string; user_metadata?: Record<string, any> } | undefined
    const userId = String(claims?.sub || '').trim()
    const email = String(claims?.email || '').trim().toLowerCase()
    if (!userId) {
      return NextResponse.json(
        { credits: 0, plan: 'free', name: null, role: 'guest', isAdmin: false, isOwner: false },
        { status: 401 }
      )
    }

    const access = accessFromVerifiedIdentity(userId, email)
    const meta = (claims?.user_metadata || {}) as Record<string, any>
    const name =
      meta.full_name ||
      meta.name ||
      (email ? email.split('@')[0] : null)

    // Credit state is best-effort. Passing the already-verified email also
    // prevents getCreditState() from doing a service-role getUserById() merely
    // to rediscover owner/admin credit bypass.
    let state: Awaited<ReturnType<typeof getCreditState>> | null = null
    try {
      state = await getCreditState(userId, { verifiedEmail: email })
    } catch {
      state = null
    }

    return NextResponse.json({
      credits: state?.credits ?? 0,
      plan: state?.plan ?? 'free',
      name,
      role: access.role,
      isAdmin: access.isAdmin,
      isOwner: access.isOwner,
      allowance: state?.allowance,
      video: state?.video,
      image: state?.image,
      ai: state?.ai,
      allowances: state?.allowances,
    })
  } catch {
    return NextResponse.json(
      { credits: 0, plan: 'free', name: null, role: 'member', isAdmin: false, isOwner: false },
      { status: 500 }
    )
  }
}
