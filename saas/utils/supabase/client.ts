// saas/utils/supabase/client.ts
// Real browser Supabase client using @supabase/ssr when public credentials exist.
// During static prerendering or preview builds without env vars, expose a safe
// anonymous stub so layout components can compile without starting auth flows.

import { createBrowserClient } from '@supabase/ssr'

type SupabaseBrowserClient = ReturnType<typeof createBrowserClient>

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const anonymousSupabase = {
  auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
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

  return createBrowserClient(
    supabaseUrl,
    supabaseAnonKey
  )
}

export const supabase = createSafeBrowserClient()
