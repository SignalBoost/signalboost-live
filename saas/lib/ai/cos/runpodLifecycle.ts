// Cost-control lifecycle for a dedicated RunPod iTMounts primary reasoner.
// RunPod control is independent from LOCAL_AI_BASE_URL so DeepInfra can remain the fallback transport.

import { runpodControlConfigured } from './runpodConfig.ts'
import {
  configurePodStartupContract,
  queryPodRuntimeConfig,
  queryPodStatus,
  runpodStartupContractMatches,
  startPod,
  stopPod,
  type RunpodStartupOptions,
} from '../../hub/runpodTelemetry.ts'

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
  if (!runpodLifecycleConfigured()) return false
  const override = booleanOverride('RUNPOD_LIFECYCLE_ENABLED')
  return override !== false
}

export function runpodLifecycleEnabled() {
  return enabled()
}

/**
 * Primary RunPod capacity should stay warm by default. The previous 10-minute idle-stop policy
 * released the GPU reservation and repeatedly caused resume failures when another customer took the
 * host capacity. Explicit true remains available for low-traffic experiments, but Production primary
 * compute defaults to warm capacity.
 */
export function runpodAutoStopEnabled(): boolean {
  if (!runpodLifecycleConfigured() || !runpodLifecycleEnabled()) return false
  return booleanOverride('COS_RUNPOD_AUTO_STOP_ENABLED') === true
}

/** A running-but-broken pod still bills, so the unhealthy orphan guard remains on by default. */
export function runpodOrphanGuardEnabled(): boolean {
  if (!runpodLifecycleConfigured() || !runpodLifecycleEnabled()) return false
  return booleanOverride('COS_RUNPOD_ORPHAN_GUARD_ENABLED') !== false
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

/** Ensure the configured RunPod is running the exact requested reasoner/embedding startup contract. */
export async function ensureRunpodReasonerStarted(options: RunpodStartupOptions = {}): Promise<RunpodStartResult> {
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
  const contractMatches = runpodStartupContractMatches(runtimeConfig, options)

  if (before.running && contractMatches) {
    console.info('[cos-runpod-lifecycle]', JSON.stringify({
      at: new Date().toISOString(), action: 'resume_skipped', previousStatus: before.desiredStatus,
      desiredStatus: before.desiredStatus, startupContract: 'healthy', reason: 'pod_already_running',
    }))
    return {
      attempted: false, started: true, resumeRequested: false, computeStartedByRequest: false,
      startupContractRepaired: false, previousStatus: before.desiredStatus, desiredStatus: before.desiredStatus,
    }
  }

  // A stopped on-demand RunPod releases its GPU reservation. If another customer takes that capacity,
  // restarting can fail with "not enough free GPUs on the host machine". Therefore a running Pod is
  // never stopped automatically merely to repair its boot contract. Preserve the scarce allocation,
  // let the normal health check decide whether inference is usable, and defer mutation until the Pod
  // is already stopped or the workload has migrated to Serverless.
  if (before.running && !contractMatches) {
    console.warn('[cos-runpod-lifecycle]', JSON.stringify({
      at: new Date().toISOString(), action: 'startup_contract_repair_deferred_running_capacity_preserved',
      previousStatus: before.desiredStatus, desiredStatus: before.desiredStatus,
      currentEntrypoint: runtimeConfig.dockerEntrypoint,
      currentStartCmdCount: runtimeConfig.dockerStartCmd.length,
    }))
    return {
      attempted: false, started: true, resumeRequested: false, computeStartedByRequest: false,
      startupContractRepaired: false, previousStatus: before.desiredStatus, desiredStatus: before.desiredStatus,
    }
  }

  let startupContractRepaired = false
  let computeStartedByRequest = false

  if (!contractMatches) {
    console.warn('[cos-runpod-lifecycle]', JSON.stringify({
      at: new Date().toISOString(), action: 'startup_contract_repair_required',
      previousStatus: before.desiredStatus, currentEntrypoint: runtimeConfig.dockerEntrypoint,
      currentStartCmdCount: runtimeConfig.dockerStartCmd.length,
    }))

    const configured = await configurePodStartupContract(options)
    startupContractRepaired = true
    console.info('[cos-runpod-lifecycle]', JSON.stringify({
      at: new Date().toISOString(), action: 'startup_contract_repaired', previousStatus: before.desiredStatus,
      desiredStatus: configured.desiredStatus, image: configured.image, volumeMountPath: configured.volumeMountPath,
    }))

    if (configured.desiredStatus === 'RUNNING') {
      computeStartedByRequest = true
      return {
        attempted: true, started: true, resumeRequested: false, computeStartedByRequest,
        startupContractRepaired, previousStatus: before.desiredStatus, desiredStatus: configured.desiredStatus,
      }
    }
  }

  const resumed = await startPod()
  const started = resumed.desiredStatus === 'RUNNING'
  computeStartedByRequest = started
  console.info('[cos-runpod-lifecycle]', JSON.stringify({
    at: new Date().toISOString(), action: 'resume_requested', previousStatus: before.desiredStatus,
    desiredStatus: resumed.desiredStatus, started, startupContractRepaired,
  }))
  return {
    attempted: true, started, resumeRequested: true, computeStartedByRequest, startupContractRepaired,
    previousStatus: before.desiredStatus, desiredStatus: resumed.desiredStatus,
  }
}

export async function stopRunpodReasoner(): Promise<{ attempted: boolean; stopped: boolean; previousStatus?: string; desiredStatus?: string }> {
  if (!enabled()) return { attempted: false, stopped: false }
  const before = await queryPodStatus()
  if (!before.running) return { attempted: false, stopped: true, previousStatus: before.desiredStatus, desiredStatus: before.desiredStatus }
  const stopped = await stopPod()
  const didStop = stopped.desiredStatus === 'EXITED'
  console.info('[cos-runpod-lifecycle]', JSON.stringify({
    at: new Date().toISOString(), action: 'stop_requested', previousStatus: before.desiredStatus,
    desiredStatus: stopped.desiredStatus, stopped: didStop,
  }))
  return { attempted: true, stopped: didStop, previousStatus: before.desiredStatus, desiredStatus: stopped.desiredStatus }
}
