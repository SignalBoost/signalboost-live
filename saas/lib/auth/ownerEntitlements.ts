// saas/lib/auth/ownerEntitlements.ts
// Server-only owner entitlement resolver used by billing and tool gates that only
// have a user id. Owner status comes from the same two authoritative sources as
// lib/auth/access.ts: OWNER_EMAILS and active/pending team_members rows.

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

  const { data: teamRows, error: teamError } = await admin
    .from('team_members')
    .select('role,status,member_email')
    .eq('member_id', id)
    .limit(10)

  if (!teamError && Array.isArray(teamRows)) {
    const teamOwner = teamRows.some((row) => {
      const active = row?.status === 'active' || row?.status === 'pending'
      return active && String(row?.role || '').toLowerCase() === 'owner'
    })
    if (teamOwner) return true

    const envOwners = ownerEmails()
    const emailOwner = teamRows.some((row) => envOwners.has(String(row?.member_email || '').toLowerCase()))
    if (emailOwner) return true
  }

  // Auth lookup is the durable fallback when no team_members row exists yet.
  try {
    const { data, error } = await admin.auth.admin.getUserById(id)
    if (!error) {
      const email = String(data?.user?.email || '').toLowerCase()
      if (email && ownerEmails().has(email)) return true
    }
  } catch {
    // A failed lookup must not elevate an unknown account.
  }

  return false
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
