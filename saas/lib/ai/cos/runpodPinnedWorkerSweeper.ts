// saas/lib/ai/cos/runpodPinnedWorkerSweeper.ts
//
// ALWAYS-ON BILLING LEAK (owner report 2026-09-29): RunPod sent 26 "you just enabled always on billing" notices in
// one day, $0.59-$0.94/hour each. Exams (activateMassDistilledEvaluationWorker) and canaries
// (activateMassDistilledCanaryWorker) pin an exact endpoint to min=1 so the student is awake, and set it back to
// min=0 when they finish. When the Vercel invocation is killed mid-run (maxDuration), that scale-down never runs
// and the endpoint stays min=1, billing around the clock. Nothing released it: the quota reclaim deliberately
// skips current-generation endpoints with min>=1, and the terminal GC refuses to delete any endpoint that still
// holds a worker reservation.
//
// This sweeper puts such an orphan back to min=0. It never touches an endpoint with live work on it (an exam
// reservation, a canary invocation or a Residency case inside its own lease window, the same windows the quota
// reclaim trusts), never touches anything outside the itmounts-mass-distilled- family, and never raises capacity:
// - an active graduate keeps max=1, so it stays asleep but ready to be called (scale-to-zero, as activation sets it);
// - any other orphan goes to min=0/max=0, exactly what the exam/canary scale-down would have done.
// If what is live cannot be read, it releases nothing.
import { configuredRunpodApiKey } from './runpodConfig.ts'
import { MASS_DISTILLED_IDLE_TIMEOUT_SECONDS, listMassDistilledRunpodEndpoints } from './runpodMassDistilledProvisionV2.ts'
import {
  activeCanaryRunpodEndpointIds,
  activeEvaluationRunpodEndpointIds,
  activeGraduateRunpodEndpointIds,
  activeResidencyRunpodEndpointNames,
} from './cosUniversityGraduateEndpointProtection.ts'

const MASS_PREFIX = 'itmounts-mass-distilled-'
const CONTROL_API_V2 = 'https://api.runpod.io/v2'
const PATCH_TIMEOUT_MS = 15_000
export const PINNED_WORKER_SWEEP_MAX_RELEASES = 25

const clean = (value: unknown, max = 240) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

export type SweepEndpoint = Readonly<{
  id?: unknown
  name?: unknown
  workers?: Readonly<{ min?: unknown; max?: unknown; idleTimeout?: unknown }>
}>

export type LiveEndpointWork = Readonly<{
  graduateIds: ReadonlySet<string>
  evaluationIds: ReadonlySet<string>
  canaryIds: ReadonlySet<string>
  residencyNames: ReadonlySet<string>
}>

export type PinnedWorkerRelease = Readonly<{
  endpointId: string
  endpointName: string
  fromMin: number
  fromMax: number
  toMin: 0
  toMax: 0 | 1
  idleTimeout: number
  graduate: boolean
}>

/** Pure: which pinned mass-distilled endpoints are orphans, and what each one goes back to. */
export function planPinnedWorkerRelease(endpoints: readonly SweepEndpoint[], live: LiveEndpointWork) {
  const releases: PinnedWorkerRelease[] = []
  const keptLive: string[] = []
  for (const endpoint of endpoints) {
    const endpointId = clean(endpoint.id, 160).toLowerCase()
    const endpointName = clean(endpoint.name)
    if (!endpointId || !endpointName.toLowerCase().startsWith(MASS_PREFIX)) continue
    const min = Math.max(0, Math.floor(Number(endpoint.workers?.min) || 0))
    if (min < 1) continue
    if (live.evaluationIds.has(endpointId) || live.canaryIds.has(endpointId)
      || live.residencyNames.has(endpointName) || live.residencyNames.has(endpointName.toLowerCase())) {
      keptLive.push(endpointId)
      continue
    }
    if (releases.length >= PINNED_WORKER_SWEEP_MAX_RELEASES) continue
    const graduate = live.graduateIds.has(endpointId)
    const idle = Number(endpoint.workers?.idleTimeout)
    releases.push(Object.freeze({
      endpointId,
      endpointName,
      fromMin: min,
      fromMax: Math.max(0, Math.floor(Number(endpoint.workers?.max) || 0)),
      toMin: 0 as const,
      toMax: graduate ? 1 as const : 0 as const,
      idleTimeout: Number.isFinite(idle) && idle > 0 ? Math.floor(idle) : MASS_DISTILLED_IDLE_TIMEOUT_SECONDS,
      graduate,
    }))
  }
  return Object.freeze({ releases: Object.freeze(releases), keptLive: Object.freeze(keptLive) })
}

async function patchWorkers(release: PinnedWorkerRelease): Promise<void> {
  const key = configuredRunpodApiKey()
  if (!key) throw new Error('RUNPOD_API_KEY is not configured')
  const response = await fetch(`${CONTROL_API_V2}/serverless/${encodeURIComponent(release.endpointId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ workers: { min: 0, max: release.toMax, idleTimeout: release.idleTimeout } }),
    signal: AbortSignal.timeout(PATCH_TIMEOUT_MS),
  })
  // Status only: provider bodies are never copied into evidence.
  if (!response.ok) throw new Error(`runpod_patch_http_${response.status}`)
  const updated = await response.json().catch(() => null) as { workers?: { min?: unknown } } | null
  if (Number(updated?.workers?.min ?? Number.NaN) !== 0) throw new Error('pinned_worker_release_not_confirmed')
}

async function readLiveWork(now: Date): Promise<LiveEndpointWork> {
  const [graduateIds, evaluationIds, canaryIds, residencyNames] = await Promise.all([
    activeGraduateRunpodEndpointIds(),
    activeEvaluationRunpodEndpointIds(now),
    activeCanaryRunpodEndpointIds(now),
    activeResidencyRunpodEndpointNames(now),
  ])
  return { graduateIds, evaluationIds, canaryIds, residencyNames }
}

/** Release always-on workers left behind by killed exam/canary runs. Fails closed on any unreadable state. */
export async function releaseOrphanedPinnedWorkers(now = new Date()) {
  const live = await readLiveWork(now)
  const endpoints = await listMassDistilledRunpodEndpoints()
  const plan = planPinnedWorkerRelease(endpoints, live)
  // Re-read live work immediately before changing anything, so an exam or canary that started while the
  // endpoint list was being read is never scaled down underneath it.
  const recheck = plan.releases.length ? await readLiveWork(new Date()) : live
  const released: string[] = []
  const failures: string[] = []
  let skippedNowLive = 0
  for (const release of plan.releases) {
    if (recheck.evaluationIds.has(release.endpointId) || recheck.canaryIds.has(release.endpointId)
      || recheck.residencyNames.has(release.endpointName)) {
      skippedNowLive += 1
      continue
    }
    try {
      await patchWorkers(release)
      released.push(`${release.endpointName.slice(-40)}(${release.fromMin}/${release.fromMax}->0/${release.toMax})`)
    } catch (error) {
      failures.push(`${release.endpointId}:${clean(error instanceof Error ? error.message : String(error), 120)}`)
    }
  }
  return Object.freeze({
    pinnedLive: plan.keptLive.length,
    orphansFound: plan.releases.length,
    released: released.length,
    releasedEndpoints: Object.freeze(released.slice(0, 25)),
    skippedNowLive,
    failed: failures.length,
    failures: Object.freeze(failures.slice(0, 10)),
    authorityExpanded: false as const,
  })
}
