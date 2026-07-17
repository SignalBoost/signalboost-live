import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { FetchVercelReadOnlyClient, SupabaseVercelHealthStore, VercelDeploymentHealthIntelligence } from '@/lib/supervisor/providers/vercel'

const envOf = (v: string | null) => (v === 'production' || v === 'sandbox' || v === 'preview' ? v : 'production')
const num = (v: string | undefined, d: number) => Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d

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
  const projectId = String(body.projectId || process.env.VERCEL_PROJECT_ID || '')
  const providerConnectionId = String(body.providerConnectionId || 'VERCEL_API_TOKEN')
  if (!projectId) return NextResponse.json({ error: 'VERCEL_PROJECT_ID is required for health intelligence.' }, { status: 400 })
  const workflow = new VercelDeploymentHealthIntelligence({
    config: { providerConnectionId, projectId, teamId: process.env.VERCEL_TEAM_ID || undefined, environment: envOf(body.environment), lookbackWindowMs: num(process.env.VERCEL_HEALTH_LOOKBACK_MS, 86_400_000), maxDeployments: num(process.env.VERCEL_HEALTH_MAX_DEPLOYMENTS, 10), repeatedFailureThreshold: num(process.env.VERCEL_HEALTH_REPEATED_FAILURE_THRESHOLD, 2), stuckDeploymentThresholdMs: num(process.env.VERCEL_HEALTH_STUCK_MS, 60 * 60 * 1000), maxAttempts: 3, clock: { now: () => new Date() }, sleeper: { sleep: ms => new Promise(resolve => setTimeout(resolve, Math.min(ms, 1_000))) } },
    secretResolver: async id => id === 'VERCEL_API_TOKEN' ? (process.env.VERCEL_API_TOKEN || '') : '',
    client: new FetchVercelReadOnlyClient(),
    store: new SupabaseVercelHealthStore(auth.admin),
  })
  const run = await workflow.run()
  return NextResponse.json({ schemaVersion: 'vercel-health-run-response-v1', run })
}
