// saas/lib/auth/access.ts
// Single source of truth for authorization.

import { createServerClient } from '@supabase/ssr'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { cookies } from 'next/headers'

export type Role = 'owner' | 'admin' | 'member' | 'guest'

export type AccessContext = {
  userId: string | null
  email: string | null
  role: Role
  isOwner: boolean
  isAdmin: boolean
  isMember: boolean
}

// A guard result that never requires type-narrowing: all fields always present.
export type GuardResult = {
  ok: boolean
  status: number     // 200 when ok, 401/403 otherwise
  error: string      // '' when ok
  ctx: AccessContext
}

function envList(name: string): string[] {
  return (process.env[name] || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
}

async function getServerSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
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
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component — safe to ignore
          }
        },
      },
    },
  )
}

function buildContext(userId: string | null, email: string | null, role: Role): AccessContext {
  return {
    userId,
    email,
    role,
    isOwner: role === 'owner',
    isAdmin: role === 'owner' || role === 'admin',
    isMember: role === 'owner' || role === 'admin' || role === 'member',
  }
}

export async function getAccess(): Promise<AccessContext> {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.id) return buildContext(null, null, 'guest')

  const email = (user.email || '').toLowerCase()

  if (email && envList('OWNER_EMAILS').includes(email)) {
    return buildContext(user.id, email, 'owner')
  }

  try {
    const { data } = await supabase
      .from('team_members')
      .select('role, status')
      .or(`member_id.eq.${user.id},member_email.eq.${email}`)
    if (Array.isArray(data) && data.length > 0) {
      const active = data.filter(r => r.status === 'active' || r.status === 'pending')
      const rank: Record<string, number> = { owner: 3, admin: 2, member: 1 }
      const best = active.reduce<string | null>((acc, r) => {
        const cur = String(r.role || 'member')
        if (!acc) return cur
        return (rank[cur] || 0) > (rank[acc] || 0) ? cur : acc
      }, null)
      if (best === 'owner') return buildContext(user.id, email, 'owner')
      if (best === 'admin') return buildContext(user.id, email, 'admin')
      if (best === 'member') return buildContext(user.id, email, 'member')
    }
  } catch {
    // never crash auth
  }

  if (email && envList('ADMIN_EMAILS').includes(email)) {
    return buildContext(user.id, email, 'admin')
  }

  return buildContext(user.id, email, 'member')
}

export async function requireAdmin(): Promise<GuardResult> {
  const ctx = await getAccess()
  if (ctx.role === 'guest') return { ok: false, status: 401, error: 'Not signed in.', ctx }
  if (!ctx.isAdmin) return { ok: false, status: 403, error: 'Admin access required.', ctx }
  return { ok: true, status: 200, error: '', ctx }
}

export async function requireOwner(): Promise<GuardResult> {
  const ctx = await getAccess()
  if (ctx.role === 'guest') return { ok: false, status: 401, error: 'Not signed in.', ctx }
  if (!ctx.isOwner) return { ok: false, status: 403, error: 'Owner access required.', ctx }
  return { ok: true, status: 200, error: '', ctx }
}
