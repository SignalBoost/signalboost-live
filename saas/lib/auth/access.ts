// saas/lib/auth/access.ts
// Single source of truth for authorization. Every protected page/route/menu asks this
// "who is this user and what role do they have", instead of each one checking differently.
//
// Resolution order for a user's role:
//   1. OWNER_EMAILS env  -> 'owner'   (hard backstop so you can never lock yourself out)
//   2. team_members row  -> that role (the real, manageable source of truth)
//   3. ADMIN_EMAILS env  -> 'admin'   (legacy backstop)
//   4. otherwise         -> 'member'  (least privilege)

import { createServerClient } from '@supabase/ssr'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { cookies } from 'next/headers'

export type Role = 'owner' | 'admin' | 'member' | 'guest'

export type AccessContext = {
  userId: string | null
  email: string | null
  role: Role
  isOwner: boolean
  isAdmin: boolean   // true for owner OR admin (i.e. can see IT/admin pages)
  isMember: boolean  // true for any signed-in team member (owner/admin/member)
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

/**
 * Resolve the current user's access context from their session.
 * Safe to call from any server route or server component.
 */
export async function getAccess(): Promise<AccessContext> {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.id) return buildContext(null, null, 'guest')

  const email = (user.email || '').toLowerCase()

  // 1. Owner backstop — you can never lock yourself out via env.
  if (email && envList('OWNER_EMAILS').includes(email)) {
    return buildContext(user.id, email, 'owner')
  }

  // 2. team_members is the real source of truth.
  try {
    const { data } = await supabase
      .from('team_members')
      .select('role, status')
      .or(`member_id.eq.${user.id},member_email.eq.${email}`)
      .order('role', { ascending: true }) // 'admin' < 'member' < 'owner' alphabetically; we pick best below
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
    // table/query problem — fall through to env backstops, never crash auth
  }

  // 3. Legacy admin backstop.
  if (email && envList('ADMIN_EMAILS').includes(email)) {
    return buildContext(user.id, email, 'admin')
  }

  // 4. Signed in but not on any team -> treat as member-level (least privilege),
  //    so a logged-in person isn't locked out of their own basic dashboard,
  //    but has no admin/IT access.
  return buildContext(user.id, email, 'member')
}

/** Convenience guards for API routes. Throw-style helpers return the context or a reason. */
export async function requireAdmin(): Promise<{ ok: true; ctx: AccessContext } | { ok: false; status: number; error: string }> {
  const ctx = await getAccess()
  if (ctx.role === 'guest') return { ok: false, status: 401, error: 'Not signed in.' }
  if (!ctx.isAdmin) return { ok: false, status: 403, error: 'Admin access required.' }
  return { ok: true, ctx }
}

export async function requireOwner(): Promise<{ ok: true; ctx: AccessContext } | { ok: false; status: number; error: string }> {
  const ctx = await getAccess()
  if (ctx.role === 'guest') return { ok: false, status: 401, error: 'Not signed in.' }
  if (!ctx.isOwner) return { ok: false, status: 403, error: 'Owner access required.' }
  return { ok: true, ctx }
}
