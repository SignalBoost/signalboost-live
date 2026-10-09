import 'server-only'
import { euRuntimeReadiness } from './euRuntimeReadiness.ts'

/**
 * EU launch readiness is intentionally stricter than database connectivity.
 * Shared US-scoped auth cookies and missing EU session routing must block launch.
 */
export function euCustomerLaunchReadiness(env: NodeJS.ProcessEnv = process.env): {
  ready: boolean
  reasons: string[]
} {
  const reasons: string[] = []
  const runtime = euRuntimeReadiness(env)
  if (!runtime.ready) reasons.push(runtime.reason)
  if (env.EU_SESSION_ROUTING_VERIFIED !== 'true') reasons.push('eu_session_routing_unverified')
  if (env.EU_APPLICATION_DATA_ROUTING_VERIFIED !== 'true') reasons.push('eu_application_routing_unverified')
  if (env.EU_DELETION_EXPORT_VERIFIED !== 'true') reasons.push('eu_data_rights_unverified')
  return { ready: reasons.length === 0, reasons }
}
