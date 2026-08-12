// saas/app/api/cron/cos-runpod-idle-stop/route.ts
//
// Stops the COS reasoner pod when it has been idle past a configured threshold.
// This is the direct fix for the Aug 11 finding: $5.72 of a fresh $20 RunPod balance
// spent in ~13 hours of ordinary continuous rental with nothing calling the pod.
// "Stop when idle" turns that into pennies of storage cost between real use.
//
// SAFETY, matching every other autonomous-action gate in this codebase
// (COS_AUTONOMOUS_LEARNING_ENABLED, COS_LIVE_SOURCES_ENABLED, the audit-approved-
// remediation cron above): disabled by default. Nothing stops the pod until the
// owner explicitly sets COS_RUNPOD_AUTO_STOP_ENABLED=true. Idleness is measured
// from the same signal the owner-facing status route reports — the most recent
// cos_ai_roi_metrics row — so what this cron acts on is exactly what a human
// checking /dashboard/cos-savings or GET /api/admin/cos-runpod would see. Nothing
// here decides idleness by a separate, invisible rule.
//
// Deliberately does NOT run every minute. Stopping a few minutes later than the
// exact idle threshold costs at most a few more minutes of the hourly rate — a
// trivial amount — so this can run on the same relaxed cadence as the other
// retimed crons (every 15 minutes) rather than needing tight scheduling.

import { NextRequest, NextResponse } from 'next/server'
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
  if (process.env.COS_RUNPOD_AUTO_STOP_ENABLED !== 'true') {
    return NextResponse.json({ ok: true, stopped: false, reason: 'RunPod auto-stop is disabled by default (COS_RUNPOD_AUTO_STOP_ENABLED is not "true").' })
  }

  const secret = process.env.CRON_SECRET
  const authorization = req.headers.get('authorization') || ''
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (!runpodConfigured()) {
    return NextResponse.json({ ok: true, stopped: false, reason: 'RUNPOD_API_KEY and/or RUNPOD_POD_ID are not configured.' })
  }

  try {
    const status = await queryPodStatus()
    if (!status.running) {
      return NextResponse.json({ ok: true, stopped: false, reason: 'Pod is not currently running.' })
    }

    const idleMinutes = await minutesSinceLastCosActivity()
    const threshold = idleThresholdMinutes()

    // No activity record at all is NOT treated as "infinitely idle, stop it" — that
    // would stop a pod on its very first minute of life, before it has ever answered
    // a question, which is the opposite of the intended behaviour. Absence of
    // evidence here is absence of evidence, not evidence of idleness; skip and wait
    // for a real signal on the next run.
    if (idleMinutes === null) {
      return NextResponse.json({ ok: true, stopped: false, reason: 'No COS activity has been recorded yet; nothing to measure idleness against.' })
    }

    if (idleMinutes < threshold) {
      return NextResponse.json({ ok: true, stopped: false, idleMinutes: Math.round(idleMinutes), thresholdMinutes: threshold, reason: `Idle for ${Math.round(idleMinutes)} minutes, below the ${threshold}-minute threshold.` })
    }

    const result = await stopPod()
    return NextResponse.json({ ok: true, stopped: true, idleMinutes: Math.round(idleMinutes), thresholdMinutes: threshold, pod: result })
  } catch (error) {
    console.error('cos-runpod-idle-stop: failed', error)
    return NextResponse.json({ ok: false, stopped: false, error: error instanceof Error ? error.message : 'Idle-stop check failed.' }, { status: 500 })
  }
}
