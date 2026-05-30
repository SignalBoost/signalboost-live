import type { CookieOptionsWithName } from '@supabase/ssr'

export const marketingSupabaseCookieOptions: CookieOptionsWithName = {
  name: 'sb-marketing-auth-token',
  path: '/',
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
}

export const marketingRedirectUrls = [
  'https://signalboostapp.com/auth/callback',
  'https://saas.signalboostapp.com/auth/callback',
]
