// saas/lib/auth/ownerEntitlements.ts
// Server-only owner entitlement resolver used by billing and tool gates that only
// have a user id. Protected owner status is granted only by OWNER_EMAILS.

import { getAdminSupabase } from '@/utils/supabase/server'

function ownerEmails(): Set<string> {
  return new Set(
    String(process.env.OWNER_EMAILS || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  )
}

export async function isOwnerUserId(userId: string): Promise<boolean> {
  const id = String(userId || '').trim()
  if (!id) return false

  const admin = getAdminSupabase()

  try {
    const { data, error } = await admin.auth.admin.getUserById(id)
    if (error) return false
    const email = String(data?.user?.email || '').trim().toLowerCase()
    return Boolean(email && ownerEmails().has(email))
  } catch {
    // A failed lookup must never elevate an unknown account.
    return false
  }
}

export type OwnerEntitlements = {
  isOwner: boolean
  unlimitedCredits: boolean
  unrestrictedTools: boolean
  exemptFromUsageCaps: boolean
}

export async function getOwnerEntitlements(userId: string): Promise<OwnerEntitlements> {
  const isOwner = await isOwnerUserId(userId)
  return {
    isOwner,
    unlimitedCredits: isOwner,
    unrestrictedTools: isOwner,
    exemptFromUsageCaps: isOwner,
  }
}
