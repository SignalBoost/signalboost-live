// saas/app/api/cron/cos-runpod-idle-stop/route.ts
//
// Stops the COS reasoner pod when it has been idle past a configured threshold.
// This is the direct fix for the Aug 11 finding: $5.72 of a fresh $20 RunPod balance
// spent in ~13 hours of ordinary continuous rental with nothing calling the pod.
// "Stop when idle" turns that into storage-only cost between real use.
//
// SAFETY: auto-stop is enabled by default only when the matching RunPod wake-on-demand lifecycle
// is configured and active. An explicit COS_RUNPOD_AUTO_STOP_ENABLED=false remains an emergency
// kill switch. Idleness is measured from the same cos_ai_roi_metrics signal shown to the owner.
//
// Deliberately does NOT run every minute. Stopping a few minutes later than the exact idle threshold
// costs only those extra minutes, so the existing every-15-minutes cadence is sufficient.

import { NextRequest, NextResponse } from 'next/server'
import { runpodAutoStopEnabled, runpodLifecycleConfigured, runpodLifecycleEnabled } from '@/lib/ai/cos/runpodLifecycle'
import { runpodConfigured, queryPodStatus, stopPod } from '@/lib/hub/runpodTelemetry'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

function idleThresholdMinutes(): number {
  const value = Number(process.env.COS_RUNPOD_IDLE_MINUTES || '30')
  return Number.isFinite(value) && value > 0 ? value : 30
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
    if (!status.running) {
      return NextResponse.json({ ok: true, stopped: false, autoStopEnabled: true, reason: 'Pod is not currently running.' })
    }

    const idleMinutes = await minutesSinceLastCosActivity()
    const threshold = idleThresholdMinutes()

    // No activity record at all is NOT treated as "infinitely idle, stop it". Absence of evidence
    // here is absence of evidence, not evidence of idleness; skip until a real COS activity exists.
    if (idleMinutes === null) {
      return NextResponse.json({ ok: true, stopped: false, autoStopEnabled: true, reason: 'No COS activity has been recorded yet; nothing to measure idleness against.' })
    }

    if (idleMinutes < threshold) {
      return NextResponse.json({ ok: true, stopped: false, autoStopEnabled: true, idleMinutes: Math.round(idleMinutes), thresholdMinutes: threshold, reason: `Idle for ${Math.round(idleMinutes)} minutes, below the ${threshold}-minute threshold.` })
    }

    const result = await stopPod()
    return NextResponse.json({ ok: true, stopped: true, autoStopEnabled: true, idleMinutes: Math.round(idleMinutes), thresholdMinutes: threshold, pod: result })
  } catch (error) {
    console.error('cos-runpod-idle-stop: failed', error)
    return NextResponse.json({ ok: false, stopped: false, autoStopEnabled: true, error: error instanceof Error ? error.message : 'Idle-stop check failed.' }, { status: 500 })
  }
}
