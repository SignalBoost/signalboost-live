// saas/app/api/cron/cos-runpod-idle-stop/route.ts
//
// Stops the COS reasoner pod when it has been idle past a configured threshold.
// A running GPU whose reasoner never became healthy is treated as orphaned compute and stopped
// after a short cold-start grace period, regardless of recent failed-request activity.

import { NextRequest, NextResponse } from 'next/server'
import { runpodAutoStopEnabled, runpodLifecycleConfigured, runpodLifecycleEnabled } from '@/lib/ai/cos/runpodLifecycle'
import { checkLocalInferenceHealth, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import { shouldStopUnhealthyRunpod } from '@/lib/ai/cos/runpodOrphanGuard'
import { runpodConfigured, queryPodStatus, stopPod } from '@/lib/hub/runpodTelemetry'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

function idleThresholdMinutes(): number {
  const value = Number(process.env.COS_RUNPOD_IDLE_MINUTES || '30')
  return Number.isFinite(value) && value > 0 ? value : 30
}

function unhealthyGraceSeconds(): number {
  const value = Number(process.env.COS_RUNPOD_UNHEALTHY_GRACE_SECONDS || '300')
  return Number.isFinite(value) ? Math.max(60, Math.min(900, Math.round(value))) : 300
}

async function minutesSinceLastCosActivity(): Promise<number | null> {
  const db = cosServiceDb()
  if (!db) return null
  const { data } = await db
    .from('cos_ai_roi_metrics')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data?.created_at) return null
  return Math.max(0, (Date.now() - new Date(String(data.created_at)).getTime()) / 60_000)
}

async function probeReasonerHealth(): Promise<{ ok: boolean; error?: string }> {
  try {
    const config = localInferenceConfigFromEnv()
    const health = await checkLocalInferenceHealth({ ...config, timeoutMs: Math.min(config.timeoutMs, 5_000) })
    return health.ok ? { ok: true } : { ok: false, error: health.error || 'health check failed' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'health check failed' }
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const authorization = req.headers.get('authorization') || ''
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (!runpodAutoStopEnabled()) {
    return NextResponse.json({
      ok: true,
      stopped: false,
      autoStopEnabled: false,
      lifecycleConfigured: runpodLifecycleConfigured(),
      lifecycleEnabled: runpodLifecycleEnabled(),
      reason: 'RunPod auto-stop requires configured wake-on-demand lifecycle and is disabled only by an explicit lifecycle/auto-stop kill switch.',
    })
  }

  if (!runpodConfigured()) {
    return NextResponse.json({ ok: true, stopped: false, reason: 'RUNPOD_API_KEY and/or RUNPOD_POD_ID are not configured.' })
  }

  try {
    const status = await queryPodStatus()
    console.info('[cos-runpod-idle-stop]', JSON.stringify({
      at: new Date().toISOString(),
      podId: status.id,
      desiredStatus: status.desiredStatus,
      running: status.running,
      uptimeSeconds: status.uptimeSeconds,
      costPerHr: status.costPerHr,
    }))
    if (!status.running) {
      return NextResponse.json({ ok: true, stopped: false, autoStopEnabled: true, pod: status, reason: 'Pod is not currently running.' })
    }

    // A paid GPU that has been running past the cold-start grace window but still cannot serve
    // the configured model is orphaned compute. Failed requests must not refresh an activity timer
    // and keep that GPU billable. This probe never invokes RunPod lifecycle/wake behavior.
    const health = await probeReasonerHealth()
    const graceSeconds = unhealthyGraceSeconds()
    if (shouldStopUnhealthyRunpod({ running: status.running, uptimeSeconds: status.uptimeSeconds, healthy: health.ok, graceSeconds })) {
      const result = await stopPod()
      console.warn('[cos-runpod-orphan-stop]', JSON.stringify({
        at: new Date().toISOString(),
        podId: status.id,
        previousDesiredStatus: status.desiredStatus,
        uptimeSeconds: status.uptimeSeconds,
        reasonerHealthy: false,
        healthError: health.error || null,
        graceSeconds,
        requestedDesiredStatus: result.desiredStatus,
      }))
      return NextResponse.json({
        ok: true,
        stopped: true,
        autoStopEnabled: true,
        orphanedUnhealthyCompute: true,
        reason: `RunPod had been running for ${status.uptimeSeconds}s without a healthy COS reasoner; stopped after the ${graceSeconds}s startup grace period.`,
        pod: result,
      })
    }

    const idleMinutes = await minutesSinceLastCosActivity()
    const threshold = idleThresholdMinutes()

    if (idleMinutes === null) {
      return NextResponse.json({ ok: true, stopped: false, autoStopEnabled: true, pod: status, reasonerHealthy: health.ok, reason: 'No COS activity has been recorded yet; nothing to measure idleness against.' })
    }

    if (idleMinutes < threshold) {
      return NextResponse.json({ ok: true, stopped: false, autoStopEnabled: true, pod: status, reasonerHealthy: health.ok, idleMinutes: Math.round(idleMinutes), thresholdMinutes: threshold, reason: `Idle for ${Math.round(idleMinutes)} minutes, below the ${threshold}-minute threshold.` })
    }

    const result = await stopPod()
    return NextResponse.json({ ok: true, stopped: true, autoStopEnabled: true, reasonerHealthy: health.ok, idleMinutes: Math.round(idleMinutes), thresholdMinutes: threshold, pod: result })
  } catch (error) {
    console.error('cos-runpod-idle-stop: failed', error)
    return NextResponse.json({ ok: false, stopped: false, autoStopEnabled: true, error: error instanceof Error ? error.message : 'Idle-stop check failed.' }, { status: 500 })
  }
}
