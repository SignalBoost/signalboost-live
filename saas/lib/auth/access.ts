// saas/lib/auth/access.ts
// Single source of truth for authorization.

import { createServerClient } from '@supabase/ssr'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { isPublicDeliveryScope } from '@/lib/auth/publicDeliveryScope'
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

// Reuse an identity that has already been verified by Supabase in the current
// request. This avoids issuing a second auth.getUser() call when a route needs
// both the authenticated user object and the canonical SignalBoost role.
export function accessFromVerifiedIdentity(
  userId: string,
  emailValue: string | null | undefined,
): AccessContext {
  const email = String(emailValue || '').trim().toLowerCase()
  return buildContext(userId, email || null, envRole(email))
}

export async function getAccess(): Promise<AccessContext> {
  // Concierge is a public delivery surface. Even if the browser belongs to the
  // owner, public-delivery execution must never inherit owner/admin identity,
  // private memory, internal tools, metrics, repo access, or Chief-of-Staff mode.
  if (isPublicDeliveryScope()) return buildContext(null, null, 'guest')

  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.id) return buildContext(null, null, 'guest')
  return accessFromVerifiedIdentity(user.id, user.email)
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
