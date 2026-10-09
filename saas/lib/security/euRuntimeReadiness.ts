// Server-side readiness gate for EU authentication and data routing.
// Never include credentials or this module in browser bundles.
import 'server-only'
import { verifyEuProjectEvidence } from './euProjectReadiness.ts'

export function euRuntimeReadiness(env: NodeJS.ProcessEnv = process.env): {
  ready: boolean
  reason: string
  projectRef?: string
} {
  const url = String(env.EU_SUPABASE_URL || '').trim()
  const serviceKey = String(env.EU_SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const anonKey = String(env.EU_SUPABASE_ANON_KEY || '').trim()
  const primaryUrl = String(env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  if (!url || !serviceKey || !anonKey) return { ready: false, reason: 'eu_credentials_not_configured' }
  const match = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/.exec(url)
  if (!match) return { ready: false, reason: 'eu_supabase_url_invalid' }
  const primaryRef = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/.exec(primaryUrl)?.[1] || ''
  const evidence = verifyEuProjectEvidence({
    projectRef: match[1],
    projectRegion: String(env.EU_SUPABASE_VERIFIED_REGION || ''),
    verifiedAt: String(env.EU_SUPABASE_VERIFIED_AT || ''),
  }, primaryRef)
  if (!evidence.ready) return { ready: false, reason: evidence.reason }
  // A verified regional database is not proof of application schema / Auth readiness.
  if (env.EU_SUPABASE_SCHEMA_READY !== 'true' || env.EU_SUPABASE_AUTH_READY !== 'true') {
    return { ready: false, reason: 'eu_application_or_auth_not_ready' }
  }
  return { ready: true, reason: 'eu_runtime_configuration_ready', projectRef: match[1] }
}
