// saas/app/api/cron/cos-runpod-idle-stop/route.ts
//
// TWO INDEPENDENT CHECKS, TWO INDEPENDENT FLAGS.
//
// (1) IDLE-TIMEOUT STOP, gated by runpodAutoStopEnabled() — stops a healthy pod that has sat idle
//     past COS_RUNPOD_IDLE_MINUTES. Root-caused Aug 19 2026: RunPod releases the GPU reservation on
//     the pod's specific host when it stops, and if another customer takes that GPU before the next
//     wake, the pod cannot restart until a matching GPU frees up on that host again — "not enough
//     free GPUs on the host machine". A dedicated, stateful reasoner pod loses more to that outage
//     than the idle timeout ever saved, so this check now defaults to disableable independently.
//
// (2) ORPHAN-GUARD STOP, gated by runpodOrphanGuardEnabled() — stops a pod that IS running (still
//     billing at the full GPU rate) but whose reasoner never came up healthy after a startup grace
//     period. This is a DIFFERENT failure than idling: an unhealthy pod pays for nothing until
//     someone notices. It used to share the idle-timeout's kill switch, which meant disabling the
//     timeout also silently removed this guard. It does not anymore — each is its own decision.

import { NextRequest, NextResponse } from 'next/server'
import { runpodAutoStopEnabled, runpodLifecycleConfigured, runpodLifecycleEnabled, runpodOrphanGuardEnabled } from '@/lib/ai/cos/runpodLifecycle'
import { checkLocalInferenceHealth, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import { shouldStopUnhealthyRunpod } from '@/lib/ai/cos/runpodOrphanGuard'
import { runpodConfigured, queryPodStatus, stopPod } from '@/lib/hub/runpodTelemetry'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

function idleThresholdMinutes(): number {
  const value = Number(process.env.COS_RUNPOD_IDLE_MINUTES || '10')
  return Number.isFinite(value) && value > 0 ? value : 10
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

  const autoStopEnabled = runpodAutoStopEnabled()
  const orphanGuardEnabled = runpodOrphanGuardEnabled()

  if (!autoStopEnabled && !orphanGuardEnabled) {
    return NextResponse.json({
      ok: true,
      stopped: false,
      autoStopEnabled: false,
      orphanGuardEnabled: false,
      lifecycleConfigured: runpodLifecycleConfigured(),
      lifecycleEnabled: runpodLifecycleEnabled(),
      reason: 'Both idle-timeout stop and the orphan guard are disabled; nothing here can stop the pod.',
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
      return NextResponse.json({ ok: true, stopped: false, autoStopEnabled, orphanGuardEnabled, pod: status, reason: 'Pod is not currently running.' })
    }

    const health = await probeReasonerHealth()
    const graceSeconds = unhealthyGraceSeconds()
    if (orphanGuardEnabled && shouldStopUnhealthyRunpod({ running: status.running, uptimeSeconds: status.uptimeSeconds, healthy: health.ok, graceSeconds })) {
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
        autoStopEnabled,
        orphanGuardEnabled,
        orphanedUnhealthyCompute: true,
        reason: `RunPod had been running for ${status.uptimeSeconds}s without a healthy COS reasoner; stopped after the ${graceSeconds}s startup grace period.`,
        pod: result,
      })
    }

    if (!autoStopEnabled) {
      return NextResponse.json({ ok: true, stopped: false, autoStopEnabled: false, orphanGuardEnabled, pod: status, reasonerHealthy: health.ok, reason: 'Idle-timeout stop is disabled; the pod stays running while idle-but-healthy so it keeps its GPU reservation.' })
    }

    const idleMinutes = await minutesSinceLastCosActivity()
    const threshold = idleThresholdMinutes()
    if (idleMinutes === null) {
      return NextResponse.json({ ok: true, stopped: false, autoStopEnabled, orphanGuardEnabled, pod: status, reasonerHealthy: health.ok, reason: 'No COS activity has been recorded yet; nothing to measure idleness against.' })
    }
    if (idleMinutes < threshold) {
      return NextResponse.json({ ok: true, stopped: false, autoStopEnabled, orphanGuardEnabled, pod: status, reasonerHealthy: health.ok, idleMinutes: Math.round(idleMinutes), thresholdMinutes: threshold, reason: `Idle for ${Math.round(idleMinutes)} minutes, below the ${threshold}-minute threshold.` })
    }

    const result = await stopPod()
    return NextResponse.json({ ok: true, stopped: true, autoStopEnabled, orphanGuardEnabled, reasonerHealthy: health.ok, idleMinutes: Math.round(idleMinutes), thresholdMinutes: threshold, pod: result })
  } catch (error) {
    console.error('cos-runpod-idle-stop: failed', error)
    return NextResponse.json({ ok: false, stopped: false, autoStopEnabled, orphanGuardEnabled, error: error instanceof Error ? error.message : 'Idle-stop check failed.' }, { status: 500 })
  }
}