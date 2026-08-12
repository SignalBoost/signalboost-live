// saas/app/api/admin/cos-runpod/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { runpodConfigured, queryPodStatus, estimateSessionCostUsd, startPod, stopPod } from '@/lib/hub/runpodTelemetry'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function lastCosActivityAt(): Promise<string | null> {
  const db = cosServiceDb()
  if (!db) return null
  try {
    const { data } = await db.from('cos_ai_roi_metrics').select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle()
    return data?.created_at ? String(data.created_at) : null
  } catch { return null }
}

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  if (!runpodConfigured()) return NextResponse.json({ ok: true, configured: false, error: 'RUNPOD_API_KEY and/or RUNPOD_POD_ID are not set — pod telemetry is unavailable.' })
  try {
    const [status, lastActivity] = await Promise.all([queryPodStatus(), lastCosActivityAt()])
    const idleMinutes = lastActivity ? Math.max(0, Math.round((Date.now() - new Date(lastActivity).getTime()) / 60_000)) : null
    return NextResponse.json({ ok: true, configured: true, pod: status, estimatedSessionCostUsd: estimateSessionCostUsd(status), lastCosActivityAt: lastActivity, idleMinutes, autoStopEnabled: process.env.COS_RUNPOD_AUTO_STOP_ENABLED === 'true', autoStopIdleThresholdMinutes: Number(process.env.COS_RUNPOD_IDLE_MINUTES || '30') })
  } catch (error) {
    return NextResponse.json({ ok: false, configured: true, error: error instanceof Error ? error.message : 'Failed to read RunPod pod status.' }, { status: 502 })
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const body = await req.json().catch(() => ({}))
  const action = body?.action
  if (action !== 'start' && action !== 'stop') return NextResponse.json({ error: 'Supported actions are { "action": "start" } and { "action": "stop" }.' }, { status: 400 })
  if (!runpodConfigured()) return NextResponse.json({ error: 'RUNPOD_API_KEY and/or RUNPOD_POD_ID are not set.' }, { status: 400 })
  try {
    const result = action === 'start' ? await startPod() : await stopPod()
    return NextResponse.json({ ok: true, action, ...result })
  } catch (error) {
    return NextResponse.json({ ok: false, action, error: error instanceof Error ? error.message : `Failed to ${action} the RunPod pod.` }, { status: 502 })
  }
}
