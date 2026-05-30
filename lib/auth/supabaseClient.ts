import { createBrowserClient } from '@supabase/ssr'
import { marketingSupabaseCookieOptions } from '@/lib/auth/supabaseCookies'

type MarketingBrowserSupabase = ReturnType<typeof createBrowserClient>

const anonymousSupabase = {
  auth: {
    signInWithOAuth: async () => ({
      data: { provider: null, url: null },
      error: new Error('Supabase public credentials are not configured for this deployment.'),
    }),
  },
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
