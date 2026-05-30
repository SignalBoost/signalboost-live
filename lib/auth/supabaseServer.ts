import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { marketingSupabaseCookieOptions } from '@/lib/auth/supabaseCookies'

export async function createMarketingServerSupabase() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: marketingSupabaseCookieOptions,
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Components may not be able to write cookies; Route Handlers can.
          }
        },
      },
    }
  )
}
