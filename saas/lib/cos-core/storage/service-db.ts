import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let singleton: SupabaseClient | null | undefined

/**
 * Lightweight service-role database resolver.
 *
 * Keep this module dependency-minimal so provider-framework code and plain node:test
 * can use the governed database seam without importing the full COS storage graph.
 */
export function cosServiceDb(): SupabaseClient | null {
  if (singleton !== undefined) return singleton
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  singleton = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null
  return singleton
}
