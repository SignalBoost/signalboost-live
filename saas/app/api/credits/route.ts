import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { cookies } from 'next/headers'
import { getCreditState } from '@/lib/credits'
import { getAccess } from '@/lib/auth/access'

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

    const state = await getCreditState(user.id)

    const meta = (user.user_metadata || {}) as Record<string, any>
    const name =
      meta.full_name ||
      meta.name ||
      (user.email ? user.email.split('@')[0] : null)

    // Single source of truth for role/permissions.
    const access = await getAccess()

    return NextResponse.json({
      credits: state.credits,
      plan: state.plan,
      name,
      role: access.role,
      isAdmin: access.isAdmin,
      isOwner: access.isOwner,
    })
  } catch {
    return NextResponse.json(
      { credits: 0, plan: 'free', name: null, role: 'member', isAdmin: false, isOwner: false },
      { status: 500 }
    )
  }
}
