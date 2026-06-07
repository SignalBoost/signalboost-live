import { createBrowserClient } from '@supabase/ssr'
import { marketingSupabaseCookieOptions } from '@/lib/auth/supabaseCookies'

type MarketingBrowserSupabase = ReturnType<typeof createBrowserClient>

const notConfiguredError = new Error('Supabase public credentials are not configured for this deployment.')

const anonymousSupabase = {
  auth: {
    signInWithOAuth: async () => ({
      data: { provider: null, url: null },
      error: notConfiguredError,
    }),
    getUser: async () => ({
      data: { user: null },
      error: notConfiguredError,
    }),
  },
  from: () => ({
    select: () => ({
      eq: () => ({
        in: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: null, error: notConfiguredError }),
            }),
          }),
        }),
      }),
    }),
  }),
} as unknown as MarketingBrowserSupabase

export function createMarketingBrowserSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return anonymousSupabase
  }

  return createBrowserClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookieOptions: marketingSupabaseCookieOptions,
    }
  )
}
