'use client'

import { createBrowserClient } from '@supabase/ssr'

type SupabaseBrowserClient = ReturnType<typeof createBrowserClient>

const supabaseUrl =
  process.env.NEXT_PUBLIC_SIGNALBOOST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SIGNALBOOST_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const anonymousSupabase = {
  auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
    signInWithPassword: async () => ({ data: { user: null, session: null }, error: { message: 'Supabase is not configured.' } }),
    signInWithOAuth: async () => ({ data: { provider: null, url: null }, error: { message: 'Supabase is not configured.' } }),
    signUp: async () => ({ data: { user: null, session: null }, error: { message: 'Supabase is not configured.' } }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({
      data: {
        subscription: {
          unsubscribe: () => {},
        },
      },
    }),
  },
} as unknown as SupabaseBrowserClient

function createSafeBrowserClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return anonymousSupabase
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}

export const supabase = createSafeBrowserClient()
