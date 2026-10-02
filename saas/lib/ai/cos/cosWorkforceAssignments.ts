// saas/lib/ai/cos/cosWorkforceAssignments.ts
//
// WORKFORCE: WORKING -> PRODUCTION_VERIFIED / REMEDIATION (2026-10-02).
//
// Before this module the Workforce stage machine stopped at WORKING:
//   - a graduate that answered a real user request (createGraduateWorker) never got an assignment row, so its real
//     Production work never entered the Workforce lifecycle at all;
//   - a shadow assignment whose runtime returned nothing stayed 'working' forever (the empty path returned early);
//   - a shadow that merely returned text was stored 'completed' and displayed as PRODUCTION_VERIFIED although no one
//     verified it, and nothing ever appended 'verified_outcome' to the graduate's lifecycle ledger / résumé.
//
// Honest verification rule. Only an answer the graduate actually delivered can be verified by Production, and only by
// a governed Production outcome on that exact turn (cos_turn_outcomes, outcome_source 'production_verified:%',
// verified_success not null). Shadow work was never shown to anyone, so it ends at 'served' and is never relabelled
// as verified. Runtime failures end at 'runtime_failed' (infrastructure), never 'remediation' (competence).
import { createHash } from 'node:crypto'
import { after } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  decideAssignmentTerminal,
  decideWorkforceVerification,
  WORKFORCE_PRODUCTION_OUTCOME_NAMESPACE,
  type WorkforceTurnOutcome,
} from '@/lib/ai/cos/cosWorkforceVerificationPolicy'

export { decideWorkforceVerification, WORKFORCE_PRODUCTION_OUTCOME_NAMESPACE } from '@/lib/ai/cos/cosWorkforceVerificationPolicy'
export const WORKFORCE_VERIFICATION_BATCH = 200

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const clean = (value: unknown, max = 500) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const sha256 = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')

export type WorkforceRuntimeIdentity = Readonly<{
  registryId: string
  candidateId: string
  trainedArtifactHash: string
  subjectId: string
}>

async function workforceIdentity(db: NonNullable<ReturnType<typeof cosServiceDb>>, runtime: WorkforceRuntimeIdentity) {
  const [roster, birth] = await Promise.all([
    db.from('cos_workforce_roster').select('id').eq('registry_id', runtime.registryId).eq('status', 'on_call').maybeSingle(),
    db.from('cos_university_artifact_birth_certificates').select('permanent_artifact_id')
      .eq('candidate_id', runtime.candidateId).eq('trained_artifact_hash', runtime.trainedArtifactHash).maybeSingle(),
  ])
  if (roster.error || !roster.data?.id || birth.error || !birth.data?.permanent_artifact_id) return null
  return { rosterId: String(roster.data.id), permanentArtifactId: String(birth.data.permanent_artifact_id) }
}

/**
 * A graduate delivered the answer for this exact Production turn. Record it as Workforce work awaiting Production
 * verification. Non-blocking: never delays or alters the user-visible answer.
 */
export function recordGraduateProductionServed(input: WorkforceRuntimeIdentity & {
  turnId: string
  objective: string
  servingAttemptId: string
  latencyMs: number
}): void {
  const persist = async () => {
    try {
      if (!UUID.test(clean(input.turnId, 80))) return
      const db = cosServiceDb()
      if (!db) return
      const identity = await workforceIdentity(db, input)
      if (!identity) return
      const now = new Date().toISOString()
      const result = await db.from('cos_workforce_assignments').upsert({
        registry_id: input.registryId,
        workforce_roster_id: identity.rosterId,
        permanent_artifact_id: identity.permanentArtifactId,
        source_kind: 'production_request',
        source_ref: clean(input.turnId, 80),
        objective_hash: sha256(input.objective),
        specialty: clean(input.subjectId, 240),
        status: 'served',
        assigned_at: now,
        started_at: now,
        completed_at: now,
        serving_attempt_id: input.servingAttemptId,
        outcome_evidence_hash: sha256({ attemptId: input.servingAttemptId, turnId: input.turnId, latencyMs: input.latencyMs }),
        authority_expanded: false,
        updated_at: now,
      }, { onConflict: 'registry_id,source_kind,source_ref', ignoreDuplicates: true })
      if (result.error) throw result.error
    } catch (error) {
      console.warn('[cos-workforce-assignment] production served record failed (non-blocking):', error instanceof Error ? error.message : String(error))
    }
  }
  try {
    after(persist)
  } catch {
    void persist()
  }
}

async function ledgerHasEvent(db: NonNullable<ReturnType<typeof cosServiceDb>>, registryId: string, eventType: string, correlationId: string) {
  const existing = await db.from('cos_university_graduate_lifecycle_events')
    .select('id').eq('registry_id', registryId).eq('event_type', eventType).eq('correlation_id', correlationId).limit(1)
  if (existing.error) throw existing.error
  return (existing.data || []).length > 0
}

/**
 * The stage after WORKING. For every delivered (served) Production assignment whose turn now carries a governed
 * Production outcome: append the outcome to the graduate's permanent lifecycle ledger (which the résumé is derived
 * from), then close the assignment as 'verified' or 'remediation'. Idempotent: the ledger append is keyed by the
 * assignment id, so a crash between the two writes is repaired on the next run without a duplicate event.
 */
export async function verifyServedWorkforceAssignments(limit = WORKFORCE_VERIFICATION_BATCH) {
  const db = cosServiceDb()
  if (!db) return Object.freeze({ ok: false as const, error: 'cos_service_db_unavailable' })
  const served = await db.from('cos_workforce_assignments')
    .select('id,registry_id,source_ref,serving_attempt_id,specialty,assigned_at')
    .eq('source_kind', 'production_request')
    .eq('status', 'served')
    .order('assigned_at', { ascending: true })
    .limit(Math.max(1, Math.min(limit, 500)))
  if (served.error) return Object.freeze({ ok: false as const, error: 'workforce_assignments_unreadable' })
  const rows = (served.data || []) as Array<{ id: string; registry_id: string; source_ref: string; serving_attempt_id: string | null; specialty: string }>
  const turnIds = [...new Set(rows.map(row => clean(row.source_ref, 80)).filter(id => UUID.test(id)))]
  if (!turnIds.length) return Object.freeze({ ok: true as const, awaiting: 0, verified: 0, remediation: 0, failures: Object.freeze([] as string[]) })

  const outcomes = await db.from('cos_turn_outcomes')
    .select('turn_id,verified_success,outcome_source,outcome_at')
    .in('turn_id', turnIds)
    .like('outcome_source', `${WORKFORCE_PRODUCTION_OUTCOME_NAMESPACE}%`)
  if (outcomes.error) return Object.freeze({ ok: false as const, error: 'turn_outcomes_unreadable' })
  const outcomeByTurn = new Map((outcomes.data || []).map((row: any) => [String(row.turn_id), row as WorkforceTurnOutcome]))

  const registryIds = [...new Set(rows.map(row => row.registry_id))]
  const registry = await db.from('cos_university_graduate_model_registry')
    .select('id,candidate_id,trained_artifact_hash').in('id', registryIds)
  if (registry.error) return Object.freeze({ ok: false as const, error: 'graduate_registry_unreadable' })
  const identityById = new Map((registry.data || []).map((row: any) => [String(row.id), row]))

  let verified = 0
  let remediation = 0
  let awaiting = 0
  const failures: string[] = []
  for (const row of rows) {
    const outcome = outcomeByTurn.get(clean(row.source_ref, 80))
    const decision = decideWorkforceVerification(outcome)
    if (!decision.decided) { awaiting += 1; continue }
    const identity = identityById.get(row.registry_id)
    if (!identity) { failures.push(`${row.id}:graduate_identity_missing`); continue }
    try {
      const correlationId = `workforce-assignment:${row.id}`
      if (!(await ledgerHasEvent(db, row.registry_id, decision.lifecycleEvent, correlationId))) {
        const evidence = {
          assignmentId: row.id,
          sourceKind: 'production_request',
          turnId: clean(row.source_ref, 80),
          servingAttemptId: row.serving_attempt_id,
          specialty: clean(row.specialty, 240),
          outcomeSource: clean(outcome?.outcome_source, 120),
          verifiedSuccess: outcome?.verified_success === true,
          outcomeAt: clean(outcome?.outcome_at, 40) || null,
          authorityExpanded: false,
        }
        const appended = await db.rpc('append_cos_graduate_lifecycle_event', {
          p_registry_id: row.registry_id,
          p_candidate_id: clean(identity.candidate_id, 500),
          p_trained_artifact_hash: clean(identity.trained_artifact_hash, 80),
          p_event_type: decision.lifecycleEvent,
          p_correlation_id: correlationId,
          p_evidence_hash: sha256(evidence),
          p_evidence: evidence,
          p_observed_at: new Date().toISOString(),
        })
        if (appended.error) throw appended.error
      }
      const closed = await db.from('cos_workforce_assignments').update({
        status: decision.status,
        ...(decision.status === 'remediation' ? { failure_reason: 'production_verified_failure' } : {}),
        updated_at: new Date().toISOString(),
      }).eq('id', row.id).eq('status', 'served')
      if (closed.error) throw closed.error
      if (decision.status === 'verified') verified += 1
      else remediation += 1
    } catch (error) {
      failures.push(`${row.id}:${clean(error instanceof Error ? error.message : String(error), 120)}`)
    }
  }
  const result = Object.freeze({
    ok: failures.length === 0,
    awaiting,
    verified,
    remediation,
    failures: Object.freeze(failures.slice(0, 10)),
    authorityExpanded: false as const,
  })
  console.info('[cos-workforce-verification]', JSON.stringify(result))
  return result
}
/**
 * TERMINAL RECONCILIATION (2026-10-02). An assignment is opened 'working' before the graduate is called and closed after.
 * Production trace: of 39 assignments that never got a terminal state, 38 had the call's real result in the
 * serving-attempt log - the closing write had been rejected by the old status rule and the rejection ignored. So the
 * terminal state is derived from that log (decideAssignmentTerminal): a recorded success closes 'served', a recorded
 * failure closes 'runtime_failed' with its real reason. Only a call with no result past WORKFORCE_ASSIGNMENT_MAX_OPEN_MS
 * (longest runtime timeout is 45s) closes as process_ended_mid_call / no_serving_record. Rows previously closed
 * blindly as 'no_terminal_recorded' are re-derived the same way. Served/verified/remediation rows are never touched.
 */
export const WORKFORCE_ASSIGNMENT_MAX_OPEN_MS = 10 * 60_000
export const WORKFORCE_RECONCILE_BATCH = 200
const LEGACY_BLIND_CLOSE_REASON = 'no_terminal_recorded'

export async function closeAbandonedWorkforceAssignments(now = new Date()) {
  const db = cosServiceDb()
  if (!db) return Object.freeze({ ok: false as const, error: 'cos_service_db_unavailable', closed: 0 })
  const [open, legacy] = await Promise.all([
    db.from('cos_workforce_assignments')
      .select('id,status,serving_attempt_id,assigned_at,started_at')
      .in('status', ['assigned', 'working'])
      .order('assigned_at', { ascending: true })
      .limit(WORKFORCE_RECONCILE_BATCH),
    db.from('cos_workforce_assignments')
      .select('id,status,serving_attempt_id,assigned_at,started_at')
      .eq('status', 'runtime_failed')
      .eq('failure_reason', LEGACY_BLIND_CLOSE_REASON)
      .limit(WORKFORCE_RECONCILE_BATCH),
  ])
  if (open.error || legacy.error) return Object.freeze({ ok: false as const, error: 'assignments_unreadable', closed: 0 })
  const rows = [...(open.data || []), ...(legacy.data || [])] as Array<{
    id: string; status: string; serving_attempt_id: string | null; assigned_at: string | null; started_at: string | null
  }>
  if (!rows.length) return Object.freeze({ ok: true as const, closed: 0, served: 0, failures: Object.freeze([] as string[]), authorityExpanded: false as const })

  const attemptIds = [...new Set(rows.map(row => clean(row.serving_attempt_id, 80)).filter(id => UUID.test(id)))]
  const evidence = attemptIds.length
    ? await db.from('cos_university_graduate_serving_attempts')
      .select('attempt_id,phase,outcome,error_class,latency_ms')
      .in('attempt_id', attemptIds)
    : { data: [], error: null } as any
  if (evidence.error) return Object.freeze({ ok: false as const, error: 'serving_attempts_unreadable', closed: 0 })
  const byAttempt = new Map<string, any[]>()
  for (const row of evidence.data || []) {
    const id = clean((row as any).attempt_id, 80)
    if (!byAttempt.has(id)) byAttempt.set(id, [])
    byAttempt.get(id)!.push(row)
  }

  const nowMs = now.getTime()
  const at = now.toISOString()
  let closed = 0
  let served = 0
  const failures: string[] = []
  for (const row of rows) {
    const decision = decideAssignmentTerminal({
      evidence: byAttempt.get(clean(row.serving_attempt_id, 80)) || [],
      openedAtMs: Date.parse(String(row.started_at || row.assigned_at || '')),
      nowMs,
      maxOpenMs: WORKFORCE_ASSIGNMENT_MAX_OPEN_MS,
    })
    if (!decision.close) continue
    // A legacy blind close with no better evidence keeps its row unchanged rather than churning.
    if (row.status === 'runtime_failed' && decision.status === 'runtime_failed'
      && (decision.failureReason === 'process_ended_mid_call' || decision.failureReason === 'no_serving_record')) continue
    const update = await db.from('cos_workforce_assignments')
      .update({
        status: decision.status,
        failure_reason: decision.failureReason,
        // A re-derived legacy close keeps its original completion time: the runtime circuit breaker counts recent
        // completions, and re-stamping old failures as "now" would block every graduate for an hour.
        ...(row.status === 'runtime_failed' ? {} : { completed_at: at }),
        updated_at: at,
        ...(decision.status === 'served' ? { outcome_evidence_hash: sha256({ attemptId: row.serving_attempt_id, reconciled: true }) } : {}),
      })
      .eq('id', row.id)
      .eq('status', row.status)
    if (update.error) { failures.push(`${row.id}:${clean(update.error.message, 120)}`); continue }
    closed += 1
    if (decision.status === 'served') served += 1
  }
  const result = Object.freeze({ ok: failures.length === 0, closed, served, failures: Object.freeze(failures.slice(0, 10)), authorityExpanded: false as const })
  if (closed || failures.length) console.warn('[cos-workforce-terminal-reconcile]', JSON.stringify(result))
  return result
}
// end of saas/lib/ai/cos/cosWorkforceAssignments.ts (if this line is missing, the paste was cut short)
