// Cost-control lifecycle for a dedicated RunPod COS reasoner.
// When RunPod credentials are configured, lifecycle management is enabled by default so the
// dedicated GPU can be stopped while idle and resumed only when COS actually needs local compute.
// Either lifecycle control or idle-stop can still be disabled explicitly with an environment flag.

import { runpodControlConfigured } from '@/lib/ai/cos/runpodConfig'
import {
  configurePodStartupContract,
  queryPodRuntimeConfig,
  queryPodStatus,
  runpodStartupContractMatches,
  startPod,
  stopPod,
} from '@/lib/hub/runpodTelemetry'

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
  computeStartedByRequest: boolean
  startupContractRepaired: boolean
  previousStatus: string | null
  desiredStatus: string | null
}

/**
 * Ensure a cold RunPod will actually start the COS reasoner, not merely allocate a GPU.
 *
 * RunPod recreates container-disk state when a Pod restarts, while /workspace persists. The COS
 * bootstrap and models live under /workspace, so every wake first verifies the Pod's Docker start
 * contract. A missing/mismatched contract is repaired before compute is resumed. If the Pod is
 * already RUNNING but unhealthy (this function is called only after the local health probe fails),
 * a mismatched contract is repaired by stopping the unusable container, updating it, and starting
 * it once with the correct bootstrap command.
 */
export async function ensureRunpodReasonerStarted(): Promise<RunpodStartResult> {
  if (!enabled()) {
    return {
      attempted: false,
      started: false,
      resumeRequested: false,
      computeStartedByRequest: false,
      startupContractRepaired: false,
      previousStatus: null,
      desiredStatus: null,
    }
  }

  const before = await queryPodStatus()
  const runtimeConfig = await queryPodRuntimeConfig()
  const contractMatches = runpodStartupContractMatches(runtimeConfig)

  if (before.running && contractMatches) {
    console.info('[cos-runpod-lifecycle]', JSON.stringify({
      at: new Date().toISOString(),
      action: 'resume_skipped',
      previousStatus: before.desiredStatus,
      desiredStatus: before.desiredStatus,
      startupContract: 'healthy',
      reason: 'pod_already_running',
    }))
    return {
      attempted: false,
      started: true,
      resumeRequested: false,
      computeStartedByRequest: false,
      startupContractRepaired: false,
      previousStatus: before.desiredStatus,
      desiredStatus: before.desiredStatus,
    }
  }

  let startupContractRepaired = false
  let computeStartedByRequest = false

  if (!contractMatches) {
    console.warn('[cos-runpod-lifecycle]', JSON.stringify({
      at: new Date().toISOString(),
      action: 'startup_contract_repair_required',
      previousStatus: before.desiredStatus,
      currentEntrypoint: runtimeConfig.dockerEntrypoint,
      currentStartCmdCount: runtimeConfig.dockerStartCmd.length,
    }))

    if (before.running) {
      const stopped = await stopPod()
      if (stopped.desiredStatus !== 'EXITED') {
        throw new Error(`RunPod boot-contract repair could not stop the unhealthy Pod; desiredStatus=${stopped.desiredStatus}`)
      }
    }

    const configured = await configurePodStartupContract()
    startupContractRepaired = true
    console.info('[cos-runpod-lifecycle]', JSON.stringify({
      at: new Date().toISOString(),
      action: 'startup_contract_repaired',
      previousStatus: before.desiredStatus,
      desiredStatus: configured.desiredStatus,
      image: configured.image,
      volumeMountPath: configured.volumeMountPath,
    }))

    // RunPod documents Pod update as a reset operation. If the update itself left the Pod RUNNING,
    // treat that GPU allocation as initiated by this request so the cold-start fail-safe owns it.
    if (configured.desiredStatus === 'RUNNING') {
      computeStartedByRequest = true
      return {
        attempted: true,
        started: true,
        resumeRequested: false,
        computeStartedByRequest,
        startupContractRepaired,
        previousStatus: before.desiredStatus,
        desiredStatus: configured.desiredStatus,
      }
    }
  }

  const resumed = await startPod()
  const started = resumed.desiredStatus === 'RUNNING'
  computeStartedByRequest = started
  console.info('[cos-runpod-lifecycle]', JSON.stringify({
    at: new Date().toISOString(),
    action: 'resume_requested',
    previousStatus: before.desiredStatus,
    desiredStatus: resumed.desiredStatus,
    started,
    startupContractRepaired,
  }))
  return {
    attempted: true,
    started,
    resumeRequested: true,
    computeStartedByRequest,
    startupContractRepaired,
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
