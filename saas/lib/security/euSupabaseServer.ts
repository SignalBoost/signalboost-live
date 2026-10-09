// Server-only EU Supabase adapter. Never fall back to the US project.
import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { euRuntimeReadiness } from './euRuntimeReadiness.ts'

export function getEuAdminSupabase() {
  const readiness = euRuntimeReadiness()
  if (!readiness.ready) throw new Error(`eu_supabase_unavailable:${readiness.reason}`)
  const url = process.env.EU_SUPABASE_URL!
  const key = process.env.EU_SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
