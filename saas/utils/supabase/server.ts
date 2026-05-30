// saas/utils/supabase/server.ts
// Real server-side Supabase clients for API routes and server components.
//
// Two clients, two jobs:
//   getServerSupabase()  -> reads the logged-in user's session from request cookies
//                           (anon key, respects Row Level Security). Use this to
//                           find out WHO is making the request.
//   getAdminSupabase()   -> service-role client for trusted server-side writes
//                           (bypasses RLS). Use this only inside API routes, never
//                           sent to the browser.
//
// Matches the existing browser client in ./client.ts which uses @supabase/ssr
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
// with cookie-based sessions.

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

// ── User-scoped client: knows who is logged in (from cookies) ──
export async function getServerSupabase() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: saasSupabaseCookieOptions,
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
            // Called from a Server Component without write access — safe to ignore;
            // session refresh is handled by middleware / route handlers.
          }
        },
      },
    }
  )
}

// ── Convenience: get the current logged-in user (or null) ──
export async function getCurrentUser() {
  const supabase = await getServerSupabase()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) return null
  return data.user
}

// ── Admin client: service-role, for trusted server writes only ──
// Never import this into client components. Server routes only.
export function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
