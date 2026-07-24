// saas/lib/supervisor/providers/vercel/portable/platform-env-adapter.ts
//
// PLATFORM-ONLY. The single, clearly-labeled place that reads VERCEL_* environment
// variables and assumes Supabase — for SignalBoost's own test-rig deployment. A buyer
// never imports this file; they build their own VercelObservationRuntimeConfig /
// VercelConnectionSource (see vercel-runtime-config.ts) from their vault and database.
import { SupabaseVercelHealthStore } from '../health-intelligence.ts'
import type { VercelObservationRuntimeConfig, VercelConnectionSource } from './vercel-runtime-config.ts'
import type { VercelProviderConnection } from '../trigger-ingestion.ts'

export function platformVercelRuntimeConfig(db: any): VercelObservationRuntimeConfig {
  const connectionId = process.env.VERCEL_PROVIDER_CONNECTION_ID || ''
  return {
    providerConnectionId: connectionId,
    secretResolver: (id) => (id === connectionId ? (process.env.VERCEL_API_TOKEN || '') : ''),
    healthStore: new SupabaseVercelHealthStore(db),
    lookbackWindowMs: Number(process.env.VERCEL_OBSERVATION_LOOKBACK_MS || 3600000),
    maxDeployments: Number(process.env.VERCEL_OBSERVATION_MAX_PROJECTS || 5),
    maxAttempts: Number(process.env.VERCEL_OBSERVATION_RETRY_ATTEMPTS || 1),
    softwareVersion: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
  }
}

export function platformVercelConnectionSource(db: any): VercelConnectionSource {
  return {
    async list(limit): Promise<VercelProviderConnection[]> {
      if (process.env.VERCEL_PROJECT_ID && process.env.VERCEL_PROVIDER_CONNECTION_ID) {
        return [{
          tenantId: process.env.VERCEL_TENANT_ID || 'platform',
          providerConnectionId: process.env.VERCEL_PROVIDER_CONNECTION_ID,
          projectId: process.env.VERCEL_PROJECT_ID,
          teamId: process.env.VERCEL_TEAM_ID,
          environment: (process.env.VERCEL_OBSERVATION_ENVIRONMENT as any) || 'production',
          active: true,
        }].slice(0, limit)
      }
      const { data, error } = await db.from('provider_connections')
        .select('tenant_id,id,project_id,team_id,environment,is_active')
        .eq('provider', 'vercel').eq('is_active', true).limit(limit)
      if (error) throw new Error('connection_lookup_failed')
      return (data ?? []).map((r: any) => ({
        tenantId: r.tenant_id, providerConnectionId: r.id, projectId: r.project_id, teamId: r.team_id,
        environment: ['sandbox', 'preview', 'production'].includes(r.environment) ? r.environment : 'production',
        active: !!r.is_active,
      }))
    },
  }
}
