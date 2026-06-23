// lib/auth/marketingAdmin.ts
// Shared admin gate for the marketing (root) app tree.
// Identity comes from the authenticated Supabase session. Admin status is
// resolved from SERVER-CONTROLLED signals only:
//   • app_metadata.role in {'owner','admin'}  (set server-side, users can't edit)
//   • email present in ADMIN_EMAILS / OWNER_EMAIL env allowlist
// user_metadata is deliberately NOT trusted — users can edit their own.
// Deny by default.

import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'

function allowlist(): string[] {
  return [
    ...(process.env.ADMIN_EMAILS ?? '').split(','),
    process.env.OWNER_EMAIL ?? '',
  ]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export async function getMarketingAdmin() {
  const supabase = await createMarketingServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, isAdmin: false as const }

  const role = String((user.app_metadata as any)?.role ?? '').toLowerCase()
  const email = String(user.email ?? '').toLowerCase()
  const isAdmin =
    role === 'owner' ||
    role === 'admin' ||
    (!!email && allowlist().includes(email))

  return { user, isAdmin }
}
