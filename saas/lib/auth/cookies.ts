import type { CookieOptionsWithName } from '@supabase/ssr'
import { PUBLIC_BRAND } from '@/lib/public-brand'

// Host-only cookies: intentionally no `domain` field. This keeps the current
// iTMounts session bound to the host where the user authenticated and prevents
// accidental cross-host session leakage.
export const saasSupabaseCookieOptions: CookieOptionsWithName = {
  path: '/',
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
}

export const saasSupabaseRedirectUrl = `${PUBLIC_BRAND.siteUrl}/auth/callback`
