import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { createSupervisorCoordinationStore } from '@/lib/supervisor/coordination'
import { FetchVercelReadOnlyClient, SupabaseVercelHealthStore, VercelDeploymentHealthIntelligence } from '@/lib/supervisor/providers/vercel'

const envOf = (v: unknown) => (v === 'production' || v === 'sandbox' || v === 'preview' ? v : 'production')
const num = (v: string | undefined, d: number) => Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d
const bounded = (v: unknown, max = 160) => typeof v === 'string' && v.length <= max ? v : ''

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(); if (auth instanceof NextResponse) return auth
  const url = new URL(req.url)
  const store = new SupabaseVercelHealthStore(auth.admin)
  const items = await store.listRuns({ limit: Math.min(Math.max(Number(url.searchParams.get('limit') || 25), 1), 100), status: url.searchParams.get('status') || undefined, environment: url.searchParams.get('environment') || undefined })
  return NextResponse.json({ schemaVersion: 'vercel-health-list-response-v1', items })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(); if (auth instanceof NextResponse) return auth
  const body = await req.json().catch(() => ({}))
  const projectId = bounded(body.projectId) || process.env.VERCEL_PROJECT_ID || ''
  const providerConnectionId = bounded(body.providerConnectionId) || process.env.VERCEL_PROVIDER_CONNECTION_ID || ''
  const environment = envOf(body.environment)
  if (!projectId) return NextResponse.json({ error: { code: 'missing_project_id', message: 'VERCEL_PROJECT_ID is required for health intelligence.' } }, { status: 400 })
  if (!providerConnectionId) return NextResponse.json({ error: { code: 'missing_provider_connection', message: 'A bounded Vercel provider connection reference is required.' } }, { status: 400 })
  if (process.env.VERCEL_PROJECT_ID && projectId !== process.env.VERCEL_PROJECT_ID) return NextResponse.json({ error: { code: 'unauthorized_project_scope' } }, { status: 403 })

  try {
    const now = new Date()
    const coordinationStore = createSupervisorCoordinationStore({ supabase: auth.admin, runtime: process.env.NODE_ENV as any })
    const ownerInstanceId = process.env.SUPERVISOR_INSTANCE_ID || 'vercel-health-api-instance'
    const ownerRuntimeId = process.env.SUPERVISOR_RUNTIME_ID || `runtime-${process.pid}`
    await coordinationStore.registerInstance({ instanceId: ownerInstanceId, runtimeId: ownerRuntimeId, startedAt: now.toISOString(), heartbeatAt: now.toISOString(), softwareVersion: process.env.VERCEL_GIT_COMMIT_SHA || 'local', schemaVersion: 'supervisor-instance-v1', supportedProviderKinds: ['vercel'], status: 'healthy' })
    const workItemId = `vercel-health:${projectId}:${environment}:${now.toISOString()}`
    await coordinationStore.enqueueWorkItem({ workItemId, workItemType: 'vercel_deployment_health', incidentId: `vercel-health-request:${projectId}:${environment}`, provider: 'vercel', projectId, environment, state: 'queued', priority: 50, createdAt: now.toISOString(), availableAt: now.toISOString(), attempt: 0, maxAttempts: 1, policyVersion: 'ha-policy-v1', capabilityVersion: 'vercel-browser-capabilities-v1', adapterVersion: 'vercel-browser-adapter-v1', schemaVersion: 'supervisor-work-item-v1' })
    const lease = await coordinationStore.acquireLease({ workItemId, ownerInstanceId, ownerRuntimeId, leaseDurationMs: num(process.env.SUPERVISOR_LEASE_MS, 60_000), now })
    const workflow = new VercelDeploymentHealthIntelligence({
      config: { providerConnectionId, projectId, teamId: process.env.VERCEL_TEAM_ID || undefined, environment, lookbackWindowMs: num(process.env.VERCEL_HEALTH_LOOKBACK_MS, 86_400_000), maxDeployments: num(process.env.VERCEL_HEALTH_MAX_DEPLOYMENTS, 10), repeatedFailureThreshold: num(process.env.VERCEL_HEALTH_REPEATED_FAILURE_THRESHOLD, 2), stuckDeploymentThresholdMs: num(process.env.VERCEL_HEALTH_STUCK_MS, 60 * 60 * 1000), maxAttempts: 3, clock: { now: () => new Date() }, sleeper: { sleep: ms => new Promise(resolve => setTimeout(resolve, Math.min(ms, 1_000))) } },
      secretResolver: async id => id === process.env.VERCEL_PROVIDER_CONNECTION_ID ? (process.env.VERCEL_API_TOKEN || '') : '',
      client: new FetchVercelReadOnlyClient(),
      store: new SupabaseVercelHealthStore(auth.admin),
    })
    const run = await workflow.run({ coordinationStore, workItemId, ownerInstanceId, ownerRuntimeId, leaseId: lease.leaseId, fencingToken: lease.fencingToken, executionMode: 'api_only' })
    return NextResponse.json({ schemaVersion: 'vercel-health-run-response-v1', run }, { status: run.status === 'rejected' ? 409 : 200 })
  } catch (error) {
    return NextResponse.json({ error: { code: 'vercel_health_governed_run_failed', message: error instanceof Error ? error.message.split(':')[0] : 'failed' } }, { status: 500 })
  }
}
