// lib/auth/marketingAdmin.ts
// Owner-only gate for the marketing (root) app tree.

import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'

function ownerAllowlist(): string[] {
  return [
    ...(process.env.OWNER_EMAILS ?? '').split(','),
    process.env.OWNER_EMAIL ?? '',
  ]
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

export async function getMarketingAdmin() {
  const supabase = await createMarketingServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, isAdmin: false as const }

  const email = String(user.email ?? '').trim().toLowerCase()
  const isVerifiedEmail = Boolean(user.email_confirmed_at)
  const isAdmin = Boolean(email && isVerifiedEmail && ownerAllowlist().includes(email))

  return { user, isAdmin }
}
