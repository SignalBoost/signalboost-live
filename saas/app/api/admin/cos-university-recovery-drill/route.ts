// saas/app/api/admin/cos-university-recovery-drill/route.ts
// Owner-only control surface for the Self-Healing recovery drill.
//
// POST arms a drill: it injects ONE inert fixture row into the live batch-runs table so the Supervisor
// meets a real stalled-dispatch fault. GET reports progress and, when the drill is terminal, performs the
// rollback obligation and records the verdict as Production evidence.
//
// What this route may NOT do, by construction:
//   - it never repairs the fault it injected. If it did, the drill would prove the drill works rather
//     than that Self-Healing works. Only the Supervisor may clear it, and any non-Supervisor actor
//     voids the run;
//   - it never authorizes spend, never touches campaign budgets or ceilings, and never claims work. The
//     injected row is unclaimable by the SQL claim predicate and frozen by a database trigger;
//   - it never leaves a fixture behind: every terminal verdict rolls the row back before completing, and
//     the drill has a hard TTL after which it is cleaned up regardless of outcome.
//
// The decision logic is in lib/ai/cos/cosUniversityRecoveryDrill.ts and is pure; this route is the I/O
// shell around it.
import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'
import { createHash } from 'node:crypto'
import { readUniversityMassDistillationHealth } from '@/self-healing-host/university-distillation-monitoring'
import {
  RECOVERY_DRILL_PROFILE,
  assertRecoveryDrillBounded,
  evaluateRecoveryDrill,
  planRecoveryDrill,
  type RecoveryDrillAction,
  type RecoveryDrillRecord,
  type RecoveryDrillSnapshot,
} from '@/lib/ai/cos/cosUniversityRecoveryDrill'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }
const RUNS = 'cos_university_mass_distillation_batch_runs'
const EVENTS = 'cos_university_learning_assurance_events'
const DRILL_TTL_SECONDS = 900
const DETECTION_DEADLINE_SECONDS = 300
const REPAIR_DEADLINE_SECONDS = 720
// The monitor only flags a *_dispatching run once it is older than the heartbeat window, so the fixture
// is injected already aged. It is inert either way; ageing it only avoids waiting for the clock.
const INJECTED_AGE_SECONDS = 20 * 60

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE })
}

function text(value: unknown, max = 200): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** The drill record lives in the assurance ledger; there is no new table and no mutable drill state. */
async function loadDrill(db: any): Promise<{ drill: RecoveryDrillRecord; rolledBack: boolean } | null> {
  const result = await db.from(EVENTS)
    .select('evidence,observed_at')
    .eq('event_type', 'fine_tune')
    .like('candidate_id', 'drill:%')
    .order('observed_at', { ascending: false })
    .limit(50)
  if (result.error) throw result.error
  const rows = (result.data || []) as Array<{ evidence: any }>
  const armed = rows.find(row => row.evidence?.profile === RECOVERY_DRILL_PROFILE && row.evidence?.claim === 'recovery_drill_armed')
  if (!armed) return null
  const drill = armed.evidence.drill as RecoveryDrillRecord
  const rolledBack = rows.some(row => row.evidence?.claim === 'recovery_drill_completed'
    && row.evidence?.drill?.drillId === drill.drillId)
  return { drill, rolledBack }
}

async function snapshots(db: any, drill: RecoveryDrillRecord): Promise<RecoveryDrillSnapshot[]> {
  const live = await readUniversityMassDistillationHealth({ db })
  const history = await db.from(EVENTS)
    .select('evidence,observed_at')
    .eq('event_type', 'fine_tune')
    .like('candidate_id', 'drill:%')
    .gte('observed_at', drill.armedAt)
    .order('observed_at', { ascending: true })
    .limit(200)
  if (history.error) throw history.error
  const recorded = ((history.data || []) as Array<{ evidence: any }>)
    .filter(row => row.evidence?.claim === 'recovery_drill_observation' && row.evidence?.snapshot)
    .map(row => row.evidence.snapshot as RecoveryDrillSnapshot)
  return [...recorded, { checkedAt: live.checkedAt, state: live.state, reasons: live.reasons }]
}

/**
 * Actions against the injected row. The actor is derived from who recorded the event, never from the
 * request: a drill that could describe its own repairer would be worthless.
 */
async function actions(db: any, drill: RecoveryDrillRecord): Promise<RecoveryDrillAction[]> {
  const result = await db.from(EVENTS)
    .select('evidence,observed_at,verifier')
    .gte('observed_at', drill.armedAt)
    .order('observed_at', { ascending: true })
    .limit(400)
  if (result.error) throw result.error
  return ((result.data || []) as Array<{ evidence: any; observed_at: string; verifier: string }>)
    .filter(row => text(row.evidence?.drillRunId) === drill.injectedRunId)
    .map(row => ({
      observedAt: row.observed_at,
      actor: row.verifier === 'self_healing_supervisor' ? 'supervisor'
        : row.verifier === 'host_controller' ? 'owner'
        : row.verifier ? 'other_agent' : 'unknown',
      kind: text(row.evidence?.claim).includes('repair') ? 'repair_applied'
        : text(row.evidence?.claim).includes('incident') ? 'incident_opened'
        : 'run_cleared',
      runId: drill.injectedRunId,
    }))
}

/**
 * Drill evidence is written to the assurance ledger the way canary evidence is, NOT through
 * recordCosUniversityProductionPath. A learning path id would be wrong twice over: an undeclared path is
 * surfaced as staging drift, and a declared one becomes REQUIRED by aggregate verification, so every
 * period without a running drill would block graduation. A drill is operational proof, not coursework.
 */
async function record(db: any, drill: RecoveryDrillRecord, claim: string, evidence: Record<string, unknown>) {
  const candidateId = `drill:${drill.drillId}`
  const body = { profile: RECOVERY_DRILL_PROFILE, claim, drillId: drill.drillId, drillRunId: drill.injectedRunId, ...evidence, authorityExpanded: false }
  const evidenceHash = createHash('sha256').update(JSON.stringify(body)).digest('hex')
  const result = await db.from(EVENTS).upsert({
    event_key: createHash('sha256').update(JSON.stringify([RECOVERY_DRILL_PROFILE, claim, drill.drillId, evidenceHash])).digest('hex'),
    event_type: 'fine_tune',
    subject_id: 'Reasoning & Decision Science',
    candidate_id: candidateId,
    evidence_hash: evidenceHash,
    evidence: body,
    verifier: 'host_controller',
    observed_at: new Date().toISOString(),
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (result.error) throw result.error
}

export async function POST(request: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error, authRequired: true }, { status: guard.status, headers: NO_STORE })
  let body: any = null
  try { body = await request.json() } catch { body = null }
  if (text(body?.kind) !== 'self_healing_recovery') return fail('drill_kind_not_permitted', 400)

  const db = getAdminSupabase()
  if (!db) return fail('service_database_unavailable', 503)

  const existing = await loadDrill(db)
  if (existing && !existing.rolledBack) return fail('recovery_drill_already_armed', 409)

  // A drill needs a live campaign, because the monitor only sees runs belonging to one. If there is no
  // active campaign there is nothing to prove and nothing to inject into.
  const campaign = await db.from('cos_university_mass_distillation_campaigns')
    .select('id,status').in('status', ['authorized', 'active']).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (campaign.error) throw campaign.error
  if (!campaign.data?.id) return fail('no_active_campaign_to_drill', 409)

  const now = new Date()
  const drillId = `drill-${now.toISOString().replace(/[^0-9]/g, '').slice(0, 14)}`
  const injectedAt = new Date(now.getTime() - INJECTED_AGE_SECONDS * 1000).toISOString()
  const drill: RecoveryDrillRecord = {
    drillId,
    faultKind: 'dispatch_claim_stalled',
    injectedRunId: crypto.randomUUID(),
    armedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + DRILL_TTL_SECONDS * 1000).toISOString(),
    detectionDeadlineSeconds: DETECTION_DEADLINE_SECONDS,
    repairDeadlineSeconds: REPAIR_DEADLINE_SECONDS,
  }
  // Refuse an unbounded drill before anything is written.
  assertRecoveryDrillBounded(drill)

  const inserted = await db.from(RUNS).insert({
    id: drill.injectedRunId,
    campaign_id: campaign.data.id,
    batch_key: `${drillId}-fixture`,
    candidate_id: `drill:${drillId}`,
    subject_id: 'Reasoning & Decision Science',
    stage: 'teacher_dispatching',
    drill_id: drillId,
    claimed_at: injectedAt,
    updated_at: injectedAt,
    created_at: injectedAt,
  })
  if (inserted.error) return fail(`drill_fixture_insert_failed:${text(inserted.error.message)}`, 500)

  await record(db, drill, 'recovery_drill_armed', { drill, campaignId: campaign.data.id })
  return NextResponse.json({ ok: true, drill }, { headers: NO_STORE })
}

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error, authRequired: true }, { status: guard.status, headers: NO_STORE })
  const db = getAdminSupabase()
  if (!db) return fail('service_database_unavailable', 503)

  const existing = await loadDrill(db)
  if (!existing) return NextResponse.json({ ok: true, drill: null, verdict: null }, { headers: NO_STORE })
  if (existing.rolledBack) return NextResponse.json({ ok: true, drill: existing.drill, verdict: 'completed' }, { headers: NO_STORE })

  const observed = await snapshots(db, existing.drill)
  const observedActions = await actions(db, existing.drill)
  const now = new Date()
  const verdict = evaluateRecoveryDrill({ drill: existing.drill, snapshots: observed, actions: observedActions, now })
  const plan = planRecoveryDrill({ drill: existing.drill, snapshots: observed, actions: observedActions, now, faultRolledBack: false })

  // Keep each observation so a later read can reconstruct detection timing rather than depending on
  // whoever happened to be polling.
  await record(db, existing.drill, 'recovery_drill_observation', { snapshot: observed[observed.length - 1] })

  if (plan.step === 'rollback_fault') {
    // The drill removes only its own fixture. The trigger has kept it frozen, so nothing else can have
    // become entangled with it.
    const removed = await db.from(RUNS).delete().eq('id', existing.drill.injectedRunId).eq('drill_id', existing.drill.drillId)
    if (removed.error) return fail(`drill_rollback_failed:${text(removed.error.message)}`, 500)
    await record(db, existing.drill, 'recovery_drill_completed', {
      drill: existing.drill,
      verdict,
      rollbackReason: plan.reason,
    })
    return NextResponse.json({ ok: true, drill: existing.drill, verdict, rolledBack: true }, { headers: NO_STORE })
  }

  return NextResponse.json({ ok: true, drill: existing.drill, verdict, plan }, { headers: NO_STORE })
}
