// Signed-in customer's own Supabase client (anon key + session cookies). LAB customer RPCs run with THIS client so
// the database sees auth.uid() of the real customer. Never substitute the service-role client here.
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'

export async function customerSession() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: saasSupabaseCookieOptions,
    cookies: { get: name => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
  })
  const { data } = await supabase.auth.getUser()
  return data.user ? { supabase, userId: data.user.id } : null
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Maps database exception names to safe, user-facing codes. */
export function rpcErrorCode(error: { message?: string; code?: string } | null): string {
  const message = String(error?.message ?? '')
  const known = /lab_[a-z_]+/.exec(message)
  return known ? known[0] : (error?.code ? `db_${error.code}` : 'lab_request_failed')
}
