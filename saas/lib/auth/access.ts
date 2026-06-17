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

const RANK: Record<Role, number> = { guest: 0, member: 1, admin: 2, owner: 3 }
function maxRole(a: Role, b: Role): Role {
  return RANK[a] >= RANK[b] ? a : b
}

// Role implied purely by environment allow-lists. DB-independent, so it can never
// be stripped by a transient database error — an owner listed in OWNER_EMAILS stays
// an owner even if team_members is briefly unreachable.
function envRole(email: string): Role {
  if (email && envList('OWNER_EMAILS').includes(email)) return 'owner'
  if (email && envList('ADMIN_EMAILS').includes(email)) return 'admin'
  return 'member' // authenticated floor
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

// Resolve the role granted by the team_members table.
//   { role, degraded:false } — query succeeded (role may be 'member' if no rows)
//   { role:'member', degraded:true } — query FAILED after a retry; caller must NOT
//      treat this as authoritative "you are only a member". It means "could not
//      verify", and is logged so the cause is diagnosable instead of a silent 403.
async function teamRole(
  supabase: Awaited<ReturnType<typeof getServerSupabase>>,
  userId: string,
  email: string,
): Promise<{ role: Role; degraded: boolean }> {
  const rank: Record<string, number> = { owner: 3, admin: 2, member: 1 }
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase
      .from('team_members')
      .select('role, status')
      .or(`member_id.eq.${userId},member_email.eq.${email}`)

    if (!error) {
      if (Array.isArray(data) && data.length > 0) {
        const active = data.filter(r => r.status === 'active' || r.status === 'pending')
        const best = active.reduce<string | null>((acc, r) => {
          const cur = String(r.role || 'member')
          if (!acc) return cur
          return (rank[cur] || 0) > (rank[acc] || 0) ? cur : acc
        }, null)
        if (best === 'owner') return { role: 'owner', degraded: false }
        if (best === 'admin') return { role: 'admin', degraded: false }
        if (best === 'member') return { role: 'member', degraded: false }
      }
      return { role: 'member', degraded: false } // queried fine, no elevating row
    }

    // Transient error — one quick retry before giving up.
    if (attempt === 0) {
      await new Promise(r => setTimeout(r, 150))
      continue
    }
    // Loud, not silent: a DB blip must be diagnosable, never a mystery downgrade.
    console.error('getAccess: team_members lookup failed after retry —', error?.message || 'unknown error')
    return { role: 'member', degraded: true }
  }
  return { role: 'member', degraded: true }
}

export async function getAccess(): Promise<AccessContext> {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.id) return buildContext(null, null, 'guest')

  const email = (user.email || '').toLowerCase()

  // Env-defined role is computed first and is immune to DB state.
  const fromEnv = envRole(email)

  // If the env list already grants the highest role, skip the DB entirely.
  if (fromEnv === 'owner') return buildContext(user.id, email, 'owner')

  // Otherwise consult team_members (with retry). The final role is the strongest
  // of the two sources. On a degraded (failed) DB lookup we fall back to the env
  // role rather than silently demoting — env owners/admins keep their access, and
  // anyone whose elevation lives ONLY in team_members fails closed BUT is logged.
  const fromDb = await teamRole(supabase, user.id, email)
  const role = maxRole(fromEnv, fromDb.role)

  return buildContext(user.id, email, role)
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
