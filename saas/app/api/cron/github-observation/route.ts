import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import { createSupervisorCoordinationStore } from '@/lib/supervisor/coordination'
import { enqueueGitHubObservation, loadActiveGitHubConnections, runAcceptedGitHubObservation } from '@/lib/provider-framework/github-production'
import type { GitHubCapability } from '@/lib/provider-framework/github'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const bounded = (name: string, fallback: number, max: number) => Math.min(Math.max(Number(process.env[name] || fallback), 1), max)
const capability = (): GitHubCapability => {
  const configured = process.env.GITHUB_OBSERVATION_CAPABILITY || 'github.repository.read'
  const allowed = new Set<GitHubCapability>(['github.repository.read','github.workflow_runs.read','github.failed_workflow_runs.read','github.pull_requests.read','github.pull_request_status.read','github.branch_protection.read','github.security_alerts.summary','github.rate_limit.read'])
  return allowed.has(configured as GitHubCapability) ? configured as GitHubCapability : 'github.repository.read'
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: { code: 'unauthorized_cron' } }, { status: 401 })
  }
  const db = getAdminSupabase()
  let coordinationStore
  try { coordinationStore = createSupervisorCoordinationStore({ supabase: db, runtime: process.env.NODE_ENV as any }) }
  catch { return NextResponse.json({ ok: false, outcome: 'deferred', error: { code: 'coordination_unavailable' } }, { status: 503 }) }

  const started = Date.now()
  const maxConnections = bounded('GITHUB_OBSERVATION_MAX_CONNECTIONS', 3, 25)
  const maxDurationMs = bounded('GITHUB_OBSERVATION_MAX_DURATION_MS', 45000, 55000)
  const leaseMs = bounded('SUPERVISOR_LEASE_MS', 60000, 300000)
  const selectedCapability = capability()
  const summary: Array<Record<string, unknown>> = []

  try { await coordinationStore.reconcileExpiredLeases(new Date()) }
  catch { summary.push({ phase: 'reconciliation', outcome: 'deferred', reason: 'coordination_unavailable' }) }

  const connections = await loadActiveGitHubConnections(db, maxConnections)
  const windowStart = new Date(Math.floor(Date.now() / 300000) * 300000).toISOString()
  for (const connection of connections) {
    if (Date.now() - started > maxDurationMs) { summary.push({ outcome: 'deferred', reason: 'max_duration' }); break }
    try {
      const accepted = await enqueueGitHubObservation({ coordinationStore, connection, capability: selectedCapability, windowStart })
      let observationCount = 0
      if (accepted.outcome === 'created' && accepted.workItem) {
        const observations = await runAcceptedGitHubObservation({
          db, coordinationStore, connection, workItem: accepted.workItem, capability: selectedCapability,
          ownerInstanceId: process.env.SUPERVISOR_INSTANCE_ID || 'github-observation-cron',
          ownerRuntimeId: process.env.SUPERVISOR_RUNTIME_ID || `runtime-${process.pid}`,
          leaseMs,
        })
        observationCount = observations.length
      }
      summary.push({ repository: `${connection.owner}/${connection.repository}`, capability: selectedCapability, outcome: accepted.outcome, workItemId: accepted.workItem?.workItemId, observationCount })
    } catch (error: any) {
      summary.push({ repository: `${connection.owner}/${connection.repository}`, capability: selectedCapability, outcome: 'rejected', reason: String(error?.message || 'failed').split(':')[0] })
    }
  }

  return NextResponse.json({
    ok: true,
    schemaVersion: 'github-observation-cron-v1',
    readOnly: true,
    repairAttempted: false,
    providerMutations: false,
    productionBrowserExecution: false,
    summary,
  })
}
