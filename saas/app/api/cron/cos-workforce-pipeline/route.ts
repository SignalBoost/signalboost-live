// saas/app/api/cron/cos-workforce-pipeline/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { drainGraduateServingEvidence } from '@/lib/ai/cos/graduateServingAttempts'
import { runWorkforceApprenticeShadow } from '@/lib/ai/cos/cosReasoningWorkers'
import { closeAbandonedWorkforceAssignments, verifyServedWorkforceAssignments } from '@/lib/ai/cos/cosWorkforceAssignments'
import { graduateRunpodEndpointId } from '@/lib/ai/cos/cosUniversityGraduateEndpointProtection'
import {
  deactivateMassDistilledEvaluationWorker,
  ensureMassDistilledEndpoint24Gb,
  listMassDistilledRunpodEndpoints,
} from '@/lib/ai/cos/runpodMassDistilledProvisionV2'
import {
  describeWorkforceReservation,
  reconcileWorkforceReservation,
  unknownWorkforceReservation,
  type WorkforceGraduate,
  type WorkforceReservationReport,
} from '@/lib/ai/cos/cosUniversityWorkforceReservation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300
const RUN_BUDGET_MS = 290_000
const SHADOW_MAX_MS = 60_000
const SHADOW_CLOSE_MARGIN_MS = 6_000
// The reservation reconcile gets the first part of the budget: a slot given back here is a slot the examiner can
// use this same minute, and it must never be starved by the shadow work that follows it.
const RESERVATION_BUDGET_MS = 20_000

/**
 * The workforce's on-call graduates as the reservation policy sees them: registry id, RunPod endpoint, the slot that
 * endpoint currently holds, and when the graduate last did anything. One roster read, one registry read, one RunPod
 * listing - no per-graduate round trips.
 */
async function listOnCallGraduates(db: NonNullable<ReturnType<typeof cosServiceDb>>): Promise<readonly WorkforceGraduate[]> {
  const roster = await db.from('cos_workforce_roster')
    .select('registry_id')
    .eq('status', 'on_call')
    .eq('authority_expanded', false)
    .limit(200)
  if (roster.error) throw roster.error
  const registryIds = [...new Set((roster.data || []).map((row: any) => String(row.registry_id || '').trim()).filter(Boolean))]
  if (!registryIds.length) return Object.freeze([])

  const [registry, pipeline, endpoints] = await Promise.all([
    db.from('cos_university_graduate_model_registry')
      .select('id,platform_scope')
      .eq('status', 'active')
      .eq('runtime_provider', 'runpod')
      .eq('authority_expanded', false)
      .in('id', registryIds)
      .limit(200),
    db.from('cos_workforce_post_graduation_pipeline')
      .select('registry_id,last_attempt_at')
      .in('registry_id', registryIds)
      .limit(200),
    listMassDistilledRunpodEndpoints(),
  ])
  if (registry.error) throw registry.error
  if (pipeline.error) throw pipeline.error

  const maxByEndpoint = new Map<string, number>()
  for (const endpoint of endpoints) {
    const id = String(endpoint.id || '').trim().toLowerCase()
    if (id) maxByEndpoint.set(id, Math.max(0, Math.floor(Number(endpoint.workers?.max ?? 0))))
  }
  const lastAttempt = new Map<string, string | null>()
  for (const row of pipeline.data || []) lastAttempt.set(String((row as any).registry_id || ''), (row as any).last_attempt_at ?? null)

  return Object.freeze((registry.data || []).map((row: any) => {
    const endpointId = graduateRunpodEndpointId(row.platform_scope)
    return Object.freeze({
      registryId: String(row.id),
      endpointId,
      workersMax: endpointId && maxByEndpoint.has(endpointId) ? (maxByEndpoint.get(endpointId) as number) : null,
      lastAttemptAt: lastAttempt.get(String(row.id)) ?? null,
    })
  }))
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && req.headers.get('authorization') === `Bearer ${secret}`)
}

async function run(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'cos_service_db_unavailable' }, { status: 503 })
  // NO PAID WAKE-UPS (owner 2026-10-02: "I do not want to pay $12-24 a day"). This job never boots a graduate endpoint
  // or waits for one. Practice work goes only to graduates whose endpoint is already running (runWorkforceApprenticeShadow
  // checks that with a free status read). This route is killed at maxDuration (300s), so it stops starting calls it cannot
  // finish and close before then.
  const deadline = Date.now() + RUN_BUDGET_MS

  // Enforce the workforce reservation BEFORE anything else: the declared share of the worker pool is the most
  // graduates that may hold a pinned slot (max=1); every other graduate's endpoint is released to max=0 so the canary
  // and the examiner can get a worker. Production 2026-10-03: 17 graduates held all 10 slots and the examiner was
  // told "at most 0" six times in ninety minutes. Pinning holds a slot and boots nothing (min stays 0).
  const reservation: WorkforceReservationReport = await reconcileWorkforceReservation({
    deadlineMs: Date.now() + RESERVATION_BUDGET_MS,
    ports: {
      listGraduates: () => listOnCallGraduates(db),
      // Same transport the evaluator uses to give a slot back: PATCH workers min=0/max=0 under the approved pool policy.
      releaseWorker: endpointId => deactivateMassDistilledEvaluationWorker(endpointId),
      // Same transport activation uses to hold a slot: restore the scale-to-zero/max-1 envelope. Creates nothing.
      pinWorker: endpointId => ensureMassDistilledEndpoint24Gb(endpointId),
    },
  }).catch(error => unknownWorkforceReservation(error))
  console.info('[cos-workforce-reservation]', describeWorkforceReservation(reservation))
  // Work goes ONLY to graduates inside the reserve. A graduate the reconcile just released is off by decision, even
  // while its worker still answers the health probe for a few seconds (2026-10-04: 14 paid 45-second timeouts on 7
  // just-released graduates). If the reconcile failed, nobody holds a known slot and nobody gets work this tick.
  const offReserve = new Set(reservation.eligibilityKnown ? reservation.excludedFromWork : [])

  // First close work that can never finish (opened, then the process ended), so it stops showing as WORKING.
  const abandoned = await closeAbandonedWorkforceAssignments().catch(error => ({
    ok: false as const,
    error: error instanceof Error ? error.message.slice(0, 160) : 'workforce_abandoned_close_failed',
    closed: 0,
  }))
  const evidence = await drainGraduateServingEvidence(200)
  // WORKING -> PRODUCTION_VERIFIED / REMEDIATION: close delivered Production work against its governed outcome and
  // write the result to the graduate's permanent lifecycle ledger (the résumé is derived from it).
  const verification = await verifyServedWorkforceAssignments().catch(error => ({
    ok: false as const,
    error: error instanceof Error ? error.message.slice(0, 160) : 'workforce_verification_failed',
  }))
  const pipeline = await db.from('cos_workforce_post_graduation_pipeline')
    .select('registry_id,ai_id,subject_id,graduated_at,activated_at,hired_at,workforce_status,first_attempt_at,last_attempt_at,serving_attempts,successful_attempts,failed_attempts,fallback_attempts,verified_outcomes,remediation_events,pipeline_stage')
    .eq('workforce_status', 'on_call')
    .order('graduated_at', { ascending: true })
    .limit(100)
  if (pipeline.error) throw pipeline.error

  const now = Date.now()
  const workers = (pipeline.data || []).map(row => {
    const anchor = Date.parse(String(row.hired_at || row.activated_at || row.graduated_at || ''))
    const idleHours = Number.isFinite(anchor) && !row.first_attempt_at ? (now - anchor) / 3_600_000 : 0
    const repeatedFailure = Number(row.successful_attempts || 0) === 0
      && (Number(row.failed_attempts || 0) >= 3 || Number(row.fallback_attempts || 0) >= 3)
    return { ...row, stranded: idleHours >= 6, repeatedFailure }
  })

  const stranded = workers.filter(row => row.stranded)
  const failing = workers.filter(row => row.repeatedFailure)

  // Recovery must do work, not merely report it. Reuse recent genuine Production user demand as
  // advisory shadow work; the normal Workforce selector still enforces diploma, roster, role and
  // problem-scope gates. Replays never replace a user-visible answer or expand authority.
  const recoveryTargets = stranded.length + failing.length
  // Infrastructure circuit breaker: do not manufacture more assignments for a worker whose recent
  // attempts already prove the runtime is unhealthy. Runtime failure is not graduate remediation.
  const recentRuntimeFailures = await db.from('cos_workforce_assignments')
    .select('registry_id,failure_reason,completed_at')
    .eq('status', 'runtime_failed')
    .gte('completed_at', new Date(Date.now() - 60 * 60_000).toISOString())
    .order('completed_at', { ascending: false })
    .limit(200)
  const runtimeFailureCounts = new Map<string, number>()
  for (const row of recentRuntimeFailures.data || []) {
    const id = String(row.registry_id || '')
    if (id) runtimeFailureCounts.set(id, (runtimeFailureCounts.get(id) || 0) + 1)
  }
  const runtimeBlocked = new Set([...runtimeFailureCounts.entries()].filter(([, count]) => count >= 2).map(([id]) => id))
  const notEligibleForWork = new Set([...runtimeBlocked, ...offReserve])
  const eligibleRecoveryTargets = reservation.eligibilityKnown
    ? workers.filter(row => (row.stranded || row.repeatedFailure) && !notEligibleForWork.has(String(row.registry_id)))
    : []
  let recoveryAttempts = 0
  if (eligibleRecoveryTargets.length > 0) {
    const demand = await db.from('assistant_messages')
      .select('id,content,created_at')
      .eq('role', 'user')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60_000).toISOString())
      .order('created_at', { ascending: false })
      .limit(24)
    if (!demand.error) {
      for (const row of demand.data || []) {
        if (recoveryAttempts >= Math.min(3, eligibleRecoveryTargets.length)) break
        const objective = String(row.content || '').trim()
        if (!objective) continue
        // Leave room to write the terminal status before the route deadline.
        const shadowTimeoutMs = Math.min(SHADOW_MAX_MS, deadline - Date.now() - SHADOW_CLOSE_MARGIN_MS)
        if (shadowTimeoutMs < 5_000) break
        await runWorkforceApprenticeShadow({
          prompt: objective,
          maxTokens: 512,
          timeoutMs: shadowTimeoutMs,
          usageContext: { feature: 'cos_workforce_recovery', purpose: 'genuine_production_replay', correlationId: `workforce-recovery:${row.id}` },
        }, objective, notEligibleForWork)
        recoveryAttempts += 1
      }
    } else {
      console.warn('[cos-workforce] recovery demand read failed closed', demand.error)
    }
  }
  return NextResponse.json({
    ok: evidence.blocked === 0 && verification.ok === true && abandoned.ok === true,
    at: new Date().toISOString(),
    workforce: workers.length,
    stages: workers.reduce<Record<string, number>>((acc, row) => {
      const key = String(row.pipeline_stage || 'unknown')
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {}),
    verification,
    reservation: { ...reservation, summary: describeWorkforceReservation(reservation) },
    selfHealing: {
      abandonedAssignmentsClosed: abandoned.closed,
      evidenceDelivered: evidence.delivered,
      evidenceBlocked: evidence.blocked,
      recoveryAttempts,
      strandedWorkers: stranded.map(row => ({ registryId: row.registry_id, aiId: row.ai_id, subjectId: row.subject_id })),
      repeatedlyFailingWorkers: failing.map(row => ({ registryId: row.registry_id, aiId: row.ai_id, subjectId: row.subject_id })),
      runtimeBlockedWorkers: workers.filter(row => runtimeBlocked.has(String(row.registry_id))).map(row => ({ registryId: row.registry_id, aiId: row.ai_id, subjectId: row.subject_id, recentRuntimeFailures: runtimeFailureCounts.get(String(row.registry_id)) || 0 })),
      authorityExpanded: false,
    },
  })
}

export async function GET(req: NextRequest) { return run(req) }
export async function POST(req: NextRequest) { return run(req) }
// end of saas/app/api/cron/cos-workforce-pipeline/route.ts (if this line is missing, the paste was cut short)
