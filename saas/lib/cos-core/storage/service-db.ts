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
  // The temporary acceptance preview uses a distinct secret; never let a
  // production-scoped service key override it or fall back when it is missing.
  const stagingPreview = process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF === 'staging/lab-free-acceptance-20261011'
  const key = stagingPreview
    ? process.env.LAB_STAGING_SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY
  if (stagingPreview && (!url || !url.includes('ezpyphjofgpkwodzoipm.supabase.co') || !key)) {
    return (singleton = null)
  }
  singleton = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null
  return singleton
}
