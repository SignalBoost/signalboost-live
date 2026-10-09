import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { euCustomerLaunchReadiness } from '@/lib/security/euCustomerLaunchReadiness.ts'

/**
 * EU session cookies are isolated from the US Supabase cookie namespace.
 * This adapter MUST NOT be substituted for regular application data routes
 * until their tenant-aware database/storage clients are implemented.
 */
export async function getEuUserSupabase() {
  const readiness = euCustomerLaunchReadiness()
  if (!readiness.ready) throw new Error('eu_session_unavailable')
  const cookieStore = await cookies()
  return createServerClient(
    process.env.EU_SUPABASE_URL!,
    process.env.EU_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        name: 'itmounts-eu-auth',
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      },
      cookies: {
        getAll: () => cookieStore.getAll().filter(cookie => cookie.name.startsWith('itmounts-eu-auth')),
        setAll: cookiesToSet => {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    },
  )
}
