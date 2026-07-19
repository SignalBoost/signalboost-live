// Platform-operations access is intentionally narrower than marketing administration.
// Analytics routes use provider-wide credentials and must never be exposed to a
// marketing-only administrator or selected by an untrusted tenant parameter.

import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'

import { isPlatformOperator } from '@/lib/auth/platformOperatorPolicy'

function ownerAllowlist(): string[] {
  return (process.env.OWNER_EMAIL ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

export async function getPlatformOperator() {
  const supabase = await createMarketingServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  return {
    user,
    isPlatformOperator: isPlatformOperator(user, ownerAllowlist()),
  }
}
