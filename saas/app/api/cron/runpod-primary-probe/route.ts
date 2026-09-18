import { NextRequest, NextResponse } from 'next/server'
import { checkLocalInferenceHealth } from '@/lib/ai/local-inference'
import { configuredRunpodApiKey, configuredRunpodPodId } from '@/lib/ai/cos/runpodConfig'
import { runpodOrphanGuardEnabled } from '@/lib/ai/cos/runpodLifecycle'
import { runpodPrimaryConfig, runpodPrimaryEnabled, runpodPrimaryModel } from '@/lib/ai/cos/runpodPrimaryInference'
import { configurePodStartupContract } from '@/lib/hub/runpodTelemetry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const RUNPOD_GRAPHQL = 'https://api.runpod.io/graphql'
const DEFAULT_UNHEALTHY_REPAIR_GRACE_SECONDS = 300

function unhealthyRepairGraceSeconds(): number {
  const raw = Number(process.env.RUNPOD_UNHEALTHY_REPAIR_GRACE_SECONDS || DEFAULT_UNHEALTHY_REPAIR_GRACE_SECONDS)
  if (!Number.isFinite(raw)) return DEFAULT_UNHEALTHY_REPAIR_GRACE_SECONDS
  return Math.max(60, Math.min(3600, Math.round(raw)))
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = configuredRunpodApiKey()
  const configuredPodId = configuredRunpodPodId()
  if (!apiKey) {
    const result = {
      ok: true,
      configured: false,
      apiKeyPresent: false,
      podIdPresent: Boolean(configuredPodId),
      inferenceReady: false,
      inferenceModel: null,
      inferenceError: 'runpod_primary_not_configured',
      repairAttempted: false,
      repairStarted: false,
      repairError: null,
    }
    console.info('[runpod-primary-probe]', JSON.stringify(result))
    return NextResponse.json(result)
  }

  try {
    const response = await fetch(`${RUNPOD_GRAPHQL}?api_key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'query { myself { clientBalance currentSpendPerHr spendLimit underBalance minBalance pods { id name desiredStatus costPerHr runtime { uptimeInSeconds } } } }',
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(`RunPod GraphQL HTTP ${response.status}`)
    const body = await response.json() as {
      data?: {
        myself?: {
          clientBalance?: number | null
          currentSpendPerHr?: number | null
          spendLimit?: number | null
          underBalance?: boolean | null
          minBalance?: number | null
          pods?: Array<{
            id?: string
            name?: string
            desiredStatus?: string
            costPerHr?: number | null
            runtime?: { uptimeInSeconds?: number | null } | null
          }>
        }
      }
      errors?: Array<{ message?: string }>
    }
    if (body.errors?.length) throw new Error(`RunPod GraphQL error: ${body.errors.map(error => error.message || 'unknown').join('; ')}`)
    const account = body.data?.myself
    if (!account) throw new Error('RunPod account status unavailable')

    const pods = (account.pods || []).slice(0, 20).map(pod => ({
      id: String(pod.id || ''),
      name: String(pod.name || ''),
      desiredStatus: String(pod.desiredStatus || 'UNKNOWN'),
      running: String(pod.desiredStatus || '') === 'RUNNING',
      costPerHr: typeof pod.costPerHr === 'number' ? pod.costPerHr : null,
      uptimeSeconds: Number(pod.runtime?.uptimeInSeconds || 0),
      configuredMatch: Boolean(configuredPodId && pod.id === configuredPodId),
    }))

    let inferenceReady = false
    let inferenceModel: string | null = null
    let inferenceError: string | null = runpodPrimaryEnabled() ? null : 'runpod_primary_disabled'
    if (configuredPodId && runpodPrimaryEnabled()) {
      try {
        const inferenceConfig = runpodPrimaryConfig('reasoner', configuredPodId)
        const health = await checkLocalInferenceHealth(inferenceConfig)
        inferenceReady = health.ok
        inferenceModel = health.model
        inferenceError = health.ok ? null : (health.error || 'runpod_primary_model_unavailable')
      } catch (error) {
        inferenceError = error instanceof Error ? error.message : String(error)
      }
    }

    let repairAttempted = false
    let repairStarted = false
    let repairError: string | null = null
    const configuredPod = configuredPodId ? pods.find(pod => pod.id === configuredPodId) : null
    const hardServingFailure = Boolean(inferenceError && /^HTTP 502\b/.test(inferenceError))
    const graceSeconds = unhealthyRepairGraceSeconds()

    // HTTP 502 means the external RunPod proxy has no usable serving process behind it. This is
    // materially different from a slow/busy inference timeout, which must never cause us to throw
    // away scarce GPU capacity. RunPod's Pod update operation applies the desired startup contract
    // and resets a RUNNING container in place, so repair does not Stop -> Start or release the GPU.
    // The next probe proves readiness before normal traffic relies on the repaired runtime.
    if (configuredPod?.running
      && !inferenceReady
      && hardServingFailure
      && configuredPod.uptimeSeconds >= graceSeconds
      && runpodOrphanGuardEnabled()) {
      repairAttempted = true
      try {
        const repaired = await configurePodStartupContract({
          reasonerModel: runpodPrimaryModel('reasoner'),
          embeddingModel: process.env.RUNPOD_PRIMARY_EMBEDDING_MODEL?.trim() || 'nomic-embed-text',
        })
        repairStarted = repaired.desiredStatus === 'RUNNING'
        if (!repairStarted) throw new Error(`runpod_unhealthy_repair_not_running:${repaired.desiredStatus}`)
        console.warn('[runpod-primary-repair]', JSON.stringify({
          ok: true,
          podId: configuredPodId,
          reason: inferenceError,
          previousUptimeSeconds: configuredPod.uptimeSeconds,
          repairMode: 'in_place_update_reset',
          desiredStatus: repaired.desiredStatus,
        }))
      } catch (error) {
        repairError = error instanceof Error ? error.message : String(error)
        console.error('[runpod-primary-repair]', JSON.stringify({
          ok: false,
          podId: configuredPodId,
          reason: inferenceError,
          repairMode: 'in_place_update_reset',
          error: repairError,
        }))
      }
    }

    const result = {
      ok: true,
      configured: true,
      configuredPodId: configuredPodId || null,
      configuredPodFound: Boolean(configuredPodId && pods.some(pod => pod.id === configuredPodId)),
      inferenceReady,
      inferenceModel,
      inferenceError,
      repairAttempted,
      repairStarted,
      repairError,
      account: {
        clientBalance: typeof account.clientBalance === 'number' ? account.clientBalance : null,
        currentSpendPerHr: typeof account.currentSpendPerHr === 'number' ? account.currentSpendPerHr : null,
        spendLimit: typeof account.spendLimit === 'number' ? account.spendLimit : null,
        underBalance: typeof account.underBalance === 'boolean' ? account.underBalance : null,
        minBalance: typeof account.minBalance === 'number' ? account.minBalance : null,
      },
      pods,
    }
    console.info('[runpod-primary-probe]', JSON.stringify(result))
    return NextResponse.json(result)
  } catch (error) {
    const result = {
      ok: false,
      configured: true,
      configuredPodId: configuredPodId || null,
      inferenceReady: false,
      inferenceModel: null,
      inferenceError: 'runpod_probe_failed',
      repairAttempted: false,
      repairStarted: false,
      repairError: null,
      error: error instanceof Error ? error.message : String(error),
    }
    console.warn('[runpod-primary-probe]', JSON.stringify(result))
    return NextResponse.json(result, { status: 502 })
  }
}
