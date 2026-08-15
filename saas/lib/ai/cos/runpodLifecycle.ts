// Cost-control lifecycle for a dedicated RunPod COS reasoner.
// When RunPod credentials are configured, lifecycle management is enabled by default so the
// dedicated GPU can be stopped while idle and resumed only when COS actually needs local compute.
// Either lifecycle control or idle-stop can still be disabled explicitly with an environment flag.

import { runpodControlConfigured } from '@/lib/ai/cos/runpodConfig'
import { queryPodStatus, startPod, stopPod } from '@/lib/hub/runpodTelemetry'

function booleanOverride(name: string): boolean | null {
  const value = process.env[name]?.trim().toLowerCase()
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

export function runpodLifecycleConfigured(): boolean {
  return runpodControlConfigured()
}

function enabled() {
  const override = booleanOverride('RUNPOD_LIFECYCLE_ENABLED')
  if (override !== null) return override
  return runpodLifecycleConfigured()
}

export function runpodLifecycleEnabled() {
  return enabled()
}

/**
 * Idle-stop is safe only when the matching wake-on-demand lifecycle is active and credentials are
 * present. With that safety contract satisfied, auto-stop defaults ON; an explicit false remains an
 * emergency/maintenance kill switch.
 */
export function runpodAutoStopEnabled(): boolean {
  if (!runpodLifecycleConfigured() || !runpodLifecycleEnabled()) return false
  return booleanOverride('COS_RUNPOD_AUTO_STOP_ENABLED') !== false
}

export type RunpodStartResult = {
  attempted: boolean
  started: boolean
  resumeRequested: boolean
  previousStatus: string | null
  desiredStatus: string | null
}

export async function ensureRunpodReasonerStarted(): Promise<RunpodStartResult> {
  if (!enabled()) {
    return { attempted: false, started: false, resumeRequested: false, previousStatus: null, desiredStatus: null }
  }

  const before = await queryPodStatus()
  if (before.running) {
    console.info('[cos-runpod-lifecycle]', JSON.stringify({
      at: new Date().toISOString(),
      action: 'resume_skipped',
      previousStatus: before.desiredStatus,
      desiredStatus: before.desiredStatus,
      reason: 'pod_already_running',
    }))
    return {
      attempted: false,
      started: true,
      resumeRequested: false,
      previousStatus: before.desiredStatus,
      desiredStatus: before.desiredStatus,
    }
  }

  const resumed = await startPod()
  const started = resumed.desiredStatus === 'RUNNING'
  console.info('[cos-runpod-lifecycle]', JSON.stringify({
    at: new Date().toISOString(),
    action: 'resume_requested',
    previousStatus: before.desiredStatus,
    desiredStatus: resumed.desiredStatus,
    started,
  }))
  return {
    attempted: true,
    started,
    resumeRequested: true,
    previousStatus: before.desiredStatus,
    desiredStatus: resumed.desiredStatus,
  }
}

export async function stopRunpodReasoner(): Promise<{ attempted: boolean; stopped: boolean; previousStatus?: string; desiredStatus?: string }> {
  if (!enabled()) return { attempted: false, stopped: false }

  const before = await queryPodStatus()
  if (!before.running) {
    console.info('[cos-runpod-lifecycle]', JSON.stringify({
      at: new Date().toISOString(),
      action: 'stop_skipped',
      previousStatus: before.desiredStatus,
      desiredStatus: before.desiredStatus,
      reason: 'pod_not_running',
    }))
    return { attempted: false, stopped: true, previousStatus: before.desiredStatus, desiredStatus: before.desiredStatus }
  }

  const stopped = await stopPod()
  const didStop = stopped.desiredStatus === 'EXITED'
  console.info('[cos-runpod-lifecycle]', JSON.stringify({
    at: new Date().toISOString(),
    action: 'stop_requested',
    previousStatus: before.desiredStatus,
    desiredStatus: stopped.desiredStatus,
    stopped: didStop,
  }))
  return { attempted: true, stopped: didStop, previousStatus: before.desiredStatus, desiredStatus: stopped.desiredStatus }
}
