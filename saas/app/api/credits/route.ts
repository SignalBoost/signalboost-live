import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { cookies } from 'next/headers'
import { getCreditState } from '@/lib/credits'
import { getAccess } from '@/lib/auth/access'

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

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.id) {
      return NextResponse.json(
        { credits: 0, plan: 'free', name: null, role: 'guest', isAdmin: false, isOwner: false },
        { status: 401 }
      )
    }

    // Resolve role/permissions FIRST and independently. The navbar gates its
    // owner/admin items on isOwner/isAdmin from this route, so a failure in the
    // credit subsystem must never strip a privileged user of their access.
    const access = await getAccess()

    const meta = (user.user_metadata || {}) as Record<string, any>
    const name =
      meta.full_name ||
      meta.name ||
      (user.email ? user.email.split('@')[0] : null)

    // Credit state is best-effort. If it throws, we still return the true role
    // so privileged navigation and gates stay intact.
    let state: Awaited<ReturnType<typeof getCreditState>> | null = null
    try {
      state = await getCreditState(user.id)
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
