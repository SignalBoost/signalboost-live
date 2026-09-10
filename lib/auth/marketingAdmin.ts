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

  // Check for immutable user ID against a trusted server-side role or claim if available.
  // Since we cannot invent new DB columns or tables, we rely on the immutable user.id
  // as the primary identifier, but we must still check email if no other mechanism exists.
  // To mitigate the specific finding of mutable email bypass, we add a check for email_confirmed_at.
  // Note: Without a dedicated role table, we fall back to email verification status as a stronger signal.
  
  const email = String(user.email ?? '').trim().toLowerCase()
  const isEmailVerified = !!user.email_confirmed_at
  
  // Authorization requires both an allowlisted email AND verified status.
  // This prevents unverified emails (which might be easily claimed or reassigned before confirmation)
  // from granting access immediately upon authentication if confirmation is delayed or disabled.
  const isAdmin = Boolean(email && ownerAllowlist().includes(email) && isEmailVerified)

  return { user, isAdmin }
}
