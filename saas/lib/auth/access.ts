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

// SignalBoost's primary owner must retain access even when deployment configuration
// is incomplete or has been reset. OWNER_EMAILS may add further owner accounts.
const DEFAULT_OWNER_EMAILS = ['cadomos@gmail.com']

function ownerEmails(): string[] {
  return [...new Set([...DEFAULT_OWNER_EMAILS, ...envList('OWNER_EMAILS')])]
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

// Public Concierge may retain the authenticated CUSTOMER identity so COS can scope
// that customer's own durable history/memory. It must never retain owner/admin
// authority or expose the authenticated email through the public delivery surface.
export function publicAccessFromVerifiedIdentity(userId: string): AccessContext {
  return buildContext(userId, null, 'member')
}

export async function getAccess(): Promise<AccessContext> {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.id) return buildContext(null, null, 'guest')

  // Concierge is a public delivery surface. Preserve only the verified customer id
  // for per-user COS continuity. Always downgrade owner/admin authority to member and
  // strip email/private role metadata before any public-delivery code can see it.
  if (isPublicDeliveryScope()) return publicAccessFromVerifiedIdentity(user.id)

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
