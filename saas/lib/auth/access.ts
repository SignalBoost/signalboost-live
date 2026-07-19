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

export type GuardResult = {
  ok: boolean
  status: number
  error: string
  ctx: AccessContext
}

function envList(name: string): string[] {
  return (process.env[name] || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

function ownerEmails(): string[] {
  return envList('OWNER_EMAILS')
}

function envRole(email: string): Role {
  if (email && ownerEmails().includes(email)) return 'owner'
  return 'member'
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
            // Called from a Server Component — safe to ignore.
          }
        },
      },
    },
  )
}

function buildContext(userId: string | null, email: string | null, role: Role): AccessContext {
  const isOwner = role === 'owner'
  return {
    userId,
    email,
    role,
    isOwner,
    // Protected admin surfaces are intentionally owner-only. The legacy admin
    // role remains a label for non-protected workflows but grants no owner access.
    isAdmin: isOwner,
    isMember: role !== 'guest',
  }
}

export async function getAccess(): Promise<AccessContext> {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.id) return buildContext(null, null, 'guest')

  const email = String(user.email || '').trim().toLowerCase()
  const role = envRole(email)

  // Only the canonical owner allowlist may create an owner context. Database
  // team roles and legacy administrator configuration cannot elevate an account.
  return buildContext(user.id, email, role)
}

export async function requireAdmin(): Promise<GuardResult> {
  const ctx = await getAccess()
  if (ctx.role === 'guest') return { ok: false, status: 401, error: 'Not signed in.', ctx }
  if (!ctx.isOwner) return { ok: false, status: 403, error: 'Owner access required.', ctx }
  return { ok: true, status: 200, error: '', ctx }
}

export async function requireOwner(): Promise<GuardResult> {
  const ctx = await getAccess()
  if (ctx.role === 'guest') return { ok: false, status: 401, error: 'Not signed in.', ctx }
  if (!ctx.isOwner) return { ok: false, status: 403, error: 'Owner access required.', ctx }
  return { ok: true, status: 200, error: '', ctx }
}
