import type { CookieOptionsWithName } from '@supabase/ssr'

// Host-only cookies: intentionally no `domain` field. This keeps
// saas.signalboostapp.com sessions on the SaaS cockpit and prevents them from
// being shared with signalboostapp.com marketing auth.
export const saasSupabaseCookieOptions: CookieOptionsWithName = {
  path: '/',
  sameSite: 'lax',
  httpOnly: true,
  secure: process.env.NODE_ENV !== 'test',
}

export const saasSupabaseRedirectUrl = 'https://saas.signalboostapp.com/auth/callback'
