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
 * ABANDONED WORK (owner 2026-10-02: 12 of 16 graduates shown WORKING). An assignment is set 'working' before the
 * graduate runtime is called and closed after it answers. If the process ends in between - Vercel kills the function
 * at maxDuration while a cold RunPod endpoint is still booting, or a row written before the 2026-10-02 empty-path fix -
 * the closing write never runs and the graduate shows WORKING forever, receiving no credit and no retry.
 * No graduate call can legitimately stay open longer than WORKFORCE_ASSIGNMENT_MAX_OPEN_MS (the longest runtime
 * timeout is 45s). Anything older never finished: close it as runtime_failed (infrastructure, never a competence
 * verdict). Only open shadow/assigned rows are touched; served/verified/remediation rows are never changed.
 */
export const WORKFORCE_ASSIGNMENT_MAX_OPEN_MS = 10 * 60_000

export async function closeAbandonedWorkforceAssignments(now = new Date()) {
  const db = cosServiceDb()
  if (!db) return Object.freeze({ ok: false as const, error: 'cos_service_db_unavailable', closed: 0 })
  const cutoff = new Date(now.getTime() - WORKFORCE_ASSIGNMENT_MAX_OPEN_MS).toISOString()
  const closedAt = now.toISOString()
  // started_at is set when the runtime call begins; an 'assigned' row may have none, so fall back to assigned_at.
  const started = await db.from('cos_workforce_assignments')
    .update({ status: 'runtime_failed', failure_reason: 'no_terminal_recorded', completed_at: closedAt, updated_at: closedAt })
    .in('status', ['assigned', 'working'])
    .lt('started_at', cutoff)
    .select('id')
  if (started.error) return Object.freeze({ ok: false as const, error: 'abandoned_close_failed', closed: 0 })
  const neverStarted = await db.from('cos_workforce_assignments')
    .update({ status: 'runtime_failed', failure_reason: 'no_terminal_recorded', completed_at: closedAt, updated_at: closedAt })
    .in('status', ['assigned', 'working'])
    .is('started_at', null)
    .lt('assigned_at', cutoff)
    .select('id')
  if (neverStarted.error) return Object.freeze({ ok: false as const, error: 'abandoned_close_failed', closed: (started.data || []).length })
  const closed = (started.data || []).length + (neverStarted.data || []).length
  if (closed) console.warn('[cos-workforce-abandoned]', JSON.stringify({ closed, cutoff }))
  return Object.freeze({ ok: true as const, closed, authorityExpanded: false as const })
}
// end of saas/lib/ai/cos/cosWorkforceAssignments.ts (if this line is missing, the paste was cut short)
