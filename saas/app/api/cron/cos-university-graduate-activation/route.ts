// saas/app/api/cron/cos-university-graduate-activation/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { activateGraduateRuntime } from '@/lib/ai/cos/cosUniversityGraduateRuntime'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'
import { servedCandidateModelFromCanary, type CanaryEventRow } from '@/lib/ai/cos/cosUniversityMassEvaluationServedModel'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { registerPromotedGraduateModel } from '@/lib/ai/cos/cosUniversityGraduateModelRegistry'
import { decideMassGraduateRegistration, type MassGraduateEvent } from '@/lib/ai/cos/cosUniversityMassGraduateRegistration'
import { decideGraduateArtifactLifecycleSync } from '@/lib/ai/cos/cosUniversityGraduateArtifactSync'
import { GRADUATE_ROLLBACK_PROOF_CLAIM, GRADUATE_ROLLBACK_PROOF_PROFILE, proveGraduateRollbackReference } from '@/lib/ai/cos/cosUniversityGraduateRollbackProof'
import { COS_UNIVERSITY_SUBJECTS } from '@/lib/ai/cos/cosUniversity'
import { ensureMassDistilledEndpoint24Gb } from '@/lib/ai/cos/runpodMassDistilledProvisionV2'
import { readCosUniversityGeneralistGraduationStatus } from '@/lib/ai/cos/cosUniversityGraduationRunner'
import { createHash } from 'node:crypto'
import { runGraduateRotationController } from '@/lib/ai/cos/cosUniversityGraduateRotationController'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// A scale-to-zero graduate runtime needs minutes to prove readiness from cold; the identity wait
// (GRADUATE_RUNTIME_READY_WAIT_MS = 240s) must fit inside this ceiling with room to record evidence.
export const maxDuration = 300

/**
 * The missing caller: promotion writes graduates as `pending_runtime`, COS routing already consumes
 * `active` graduates, and nothing in between ever invoked activateGraduateRuntime — a promoted
 * graduate would sit pending forever. This cron binds the newest pending graduate to the exact
 * serving identity already proven by its Production canary. All hard gates (promotion evidence, rollback, authority,
 * live health, exact served-model identity) live inside activateGraduateRuntime itself; this route
 * only feeds it and records the outcome, activation is idempotent per registry row, and the
 * owner switch is the environment flag below — fail-closed when absent.
 */
const ACTIVATION_ENABLED_FLAG = 'COS_GRADUATE_ACTIVATION_ENABLED'
const GENERALIST_PRIMARY_ENABLED_FLAG = 'COS_GENERALIST_PRIMARY_ACTIVATION_ENABLED'


/**
 * Bind activation to the exact mass-artifact serving identity already proven by its canary.
 * The configured graduate endpoint must itself be that canary endpoint; activation never guesses
 * a model name, provisions an endpoint, restores RunPod capacity, or mutates provider state.
 */
async function resolvePendingGraduateServingIdentity(db: any, graduate: {
  candidate_id: unknown
  trained_artifact_hash: unknown
}): Promise<{ endpointId: string; modelId: string; baseUrl: string }> {
  const candidateId = String(graduate.candidate_id || '').trim()
  const artifactHash = String(graduate.trained_artifact_hash || '').trim().toLowerCase()
  if (!candidateId || !/^[a-f0-9]{64}$/.test(artifactHash)) throw new Error('graduate_runtime_identity_invalid')

  const canaries = await db.from('cos_university_learning_assurance_events')
    .select('verifier,evidence,observed_at')
    .eq('event_type', 'fine_tune')
    .eq('candidate_id', candidateId)
    .eq('verifier', 'host_controller')
    .contains('evidence', { claim: 'local_distilled_runtime_canary_passed', exactArtifact: true })
    .order('observed_at', { ascending: false })
    .limit(100)
  if (canaries.error) throw canaries.error

  const rows = (canaries.data || []) as CanaryEventRow[]
  for (const row of rows) {
    const endpointId = String(row.evidence?.endpointId || '').trim().toLowerCase()
    if (!/^[a-z0-9_-]{3,120}$/.test(endpointId)) continue
    if (String(row.evidence?.candidateId || '') !== candidateId) continue
    if (String(row.evidence?.artifactHash || '').toLowerCase() !== artifactHash) continue
    try {
      const modelId = servedCandidateModelFromCanary(rows, { candidateId, artifactHash, endpointId })
      return { endpointId, modelId, baseUrl: `https://${endpointId}.api.runpod.ai/v1` }
    } catch {
      continue
    }
  }
  throw new Error('graduate_runtime_exact_canary_identity_missing')
}

/**
 * Subject graduates activate into bounded expert roles. COS-primary is the one deliberate
 * exception: a Reasoning & Decision Science graduate may become the generalist primary worker only
 * after COS itself holds a current A/A+ generalist credential with no pending remediation. That
 * combines artifact-level improvement/safety/transfer/retention/canary gates with cross-domain
 * University qualification instead of pretending that one narrow subject artifact is a brain.
 *
 * Computer Science and Cybersecurity graduates may assist Builder as coder workers; other subject
 * graduates enter the specialist mesh as critic/verifier/researcher capabilities.
 */
const SUBJECT_WORKER_SCOPE: Record<string, { workerRoles: string[]; problemClasses: string[] }> = {
  computer_science: {
    workerRoles: ['coder', 'critic', 'verifier', 'context_engineer'],
    problemClasses: ['university:computer_science', 'code and implementation', 'incident diagnosis', 'context engineering'],
  },
  mathematics: {
    workerRoles: ['critic', 'verifier'],
    problemClasses: ['university:mathematics', 'math and calculation'],
  },
  statistics_data_science: {
    workerRoles: ['critic', 'verifier', 'researcher', 'context_engineer'],
    problemClasses: ['university:statistics_data_science', 'math and calculation', 'context engineering'],
  },
  physics_natural_sciences: {
    workerRoles: ['critic', 'verifier', 'researcher'],
    problemClasses: ['university:physics_natural_sciences'],
  },
  quantum_computing: {
    workerRoles: ['critic', 'verifier', 'researcher'],
    problemClasses: ['university:quantum_computing'],
  },
  cybersecurity: {
    workerRoles: ['coder', 'critic', 'verifier', 'researcher'],
    problemClasses: ['university:cybersecurity', 'code and implementation', 'incident diagnosis'],
  },
  politics_government_international_relations: {
    workerRoles: ['critic', 'verifier', 'researcher'],
    problemClasses: ['university:politics_government_international_relations', 'current public facts'],
  },
  social_behavioral_sciences: {
    workerRoles: ['critic', 'verifier', 'researcher'],
    problemClasses: ['university:social_behavioral_sciences'],
  },
  economics_finance: {
    workerRoles: ['critic', 'verifier', 'researcher'],
    problemClasses: ['university:economics_finance', 'math and calculation'],
  },
  business_operations: {
    workerRoles: ['critic', 'verifier', 'researcher'],
    problemClasses: ['university:business_operations', 'planning and strategy'],
  },
  law_regulation_governance: {
    workerRoles: ['critic', 'verifier', 'researcher'],
    problemClasses: ['university:law_regulation_governance'],
  },
  language_communication: {
    workerRoles: ['critic', 'verifier'],
    problemClasses: ['university:language_communication', 'writing and content'],
  },
  history_culture_philosophy_religion: {
    workerRoles: ['critic', 'verifier', 'researcher'],
    problemClasses: ['university:history_culture_philosophy_religion'],
  },
  reasoning_decision_science: {
    workerRoles: ['critic', 'verifier', 'context_engineer'],
    problemClasses: ['university:reasoning_decision_science', 'opinion and judgment', 'planning and strategy', 'context engineering'],
  },
}

function canonicalGraduateSubjectId(value: unknown): string {
  const raw = String(value || '').trim()
  const normalized = raw.toLowerCase().replace(/\s+/g, ' ')
  const subject = COS_UNIVERSITY_SUBJECTS.find(item =>
    item.id.toLowerCase() === normalized || item.title.toLowerCase() === normalized)
  return subject?.id || raw
}

type GraduateWorkerScope = { workerRoles: string[]; problemClasses: string[] }
type PrimaryGateEvidence = {
  generalistGraduated?: boolean
  credentialStanding?: string
  currentStanding?: string
  remediationPending?: number | null
  statusReadError?: string
}

async function resolveGraduateWorkerScope(
  canonicalSubjectId: string,
  baseScope: GraduateWorkerScope,
): Promise<{ scope: GraduateWorkerScope; cosPrimary: boolean; primaryGate: string; gateEvidence: PrimaryGateEvidence }> {
  if (canonicalSubjectId !== 'reasoning_decision_science') {
    return { scope: baseScope, cosPrimary: false, primaryGate: 'specialist_subject', gateEvidence: {} }
  }
  if (String(process.env[GENERALIST_PRIMARY_ENABLED_FLAG] || '').trim() !== 'true') {
    return { scope: baseScope, cosPrimary: false, primaryGate: 'generalist_primary_disabled', gateEvidence: {} }
  }

  try {
    const status = await readCosUniversityGeneralistGraduationStatus(new Date(), 'cos')
    const credentialStanding = status.credential?.standing || 'not_graduated'
    const currentStanding = status.currentCompetenceStanding
    const remediationClear = status.remediation?.pendingCount === 0
    const remediationPending = Number(status.remediation?.pendingCount ?? NaN)
    const qualified = status.graduated === true
      && (credentialStanding === 'A' || credentialStanding === 'A+')
      && (currentStanding === 'A' || currentStanding === 'A+')
      && remediationClear
    const gateEvidence: PrimaryGateEvidence = {
      generalistGraduated: status.graduated === true,
      credentialStanding: String(credentialStanding ?? 'unknown'),
      currentStanding: String(currentStanding ?? 'unknown'),
      remediationPending: Number.isFinite(remediationPending) ? remediationPending : null,
    }

    if (!qualified) {
      return { scope: baseScope, cosPrimary: false, primaryGate: 'generalist_A_current_competence_required', gateEvidence }
    }

    return {
      scope: {
        workerRoles: ['primary', ...baseScope.workerRoles],
        problemClasses: ['*', ...baseScope.problemClasses],
      },
      cosPrimary: true,
      primaryGate: `generalist_${credentialStanding}_current_${currentStanding}_remediation_clear`,
      gateEvidence,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[cos-generalist-primary-gate] status read failed; retaining specialist scope', message)
    return { scope: baseScope, cosPrimary: false, primaryGate: 'generalist_gate_unavailable', gateEvidence: { statusReadError: message.slice(0, 200) } }
  }
}

function activeWorkerRoles(scope: unknown): string[] {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return []
  const roles = (scope as Record<string, unknown>).workerRoles
  return Array.isArray(roles) ? roles.map(value => String(value || '').trim()).filter(Boolean) : []
}

/** Writes the graduate registry row for the oldest mass artifact whose recorded evidence clears every gate. */
// The two ledgers describing one trained model never agreed automatically. The registry moves to `active` when
// activateGraduateRuntime proves health, identity and rollback; the artifact row is left at `runtime_pending`
// by everyone. Besides being wrong on its face, that stalls the queue below: registerNextMassGraduate reads the
// oldest 50 runtime_pending artifacts, so every already-activated artifact that never advanced occupies a slot
// in the window that finds the NEXT graduate.
//
// Advance the artifact to `active` only where its OWN registry row (same candidate, same artifact hash) proves a
// live runtime, and only from `runtime_pending`. The write is conditioned on that status, so it is idempotent and
// can never overwrite a quarantined, retired or still-evaluating artifact. It proves nothing and promotes
// nothing: activateGraduateRuntime already did that, and this only records the consequence.
async function reconcileGraduateArtifactLifecycle() {
  const db = cosServiceDb()
  if (!db) return { synced: 0, reason: 'service_database_unavailable' as const }

  const registry = await db.from('cos_university_graduate_model_registry')
    .select('candidate_id,trained_artifact_hash,status')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(200)
  if (registry.error) throw registry.error
  const registryRows = (registry.data || []).map((row: any) => ({
    candidateId: String(row.candidate_id || ''),
    artifactHash: String(row.trained_artifact_hash || '').toLowerCase(),
    status: String(row.status || ''),
  }))
  if (!registryRows.length) return { synced: 0, reason: 'no_active_graduate' as const }

  const artifacts = await db.from('cos_local_distillation_artifacts')
    .select('candidate_id,trained_artifact_hash,status')
    .eq('status', 'runtime_pending')
    .in('candidate_id', registryRows.map(row => row.candidateId))
    .limit(200)
  if (artifacts.error) throw artifacts.error
  const artifactRows = (artifacts.data || []).map((row: any) => ({
    candidateId: String(row.candidate_id || ''),
    artifactHash: String(row.trained_artifact_hash || '').toLowerCase(),
    status: String(row.status || ''),
  }))

  const sync = decideGraduateArtifactLifecycleSync({ registry: registryRows, artifacts: artifactRows })
  if (!sync.length) return { synced: 0, reason: 'already_in_agreement' as const }

  const nowIso = new Date().toISOString()
  const synced: string[] = []
  for (const item of sync) {
    const updated = await db.from('cos_local_distillation_artifacts')
      .update({ status: item.toStatus, updated_at: nowIso })
      .eq('candidate_id', item.candidateId)
      .eq('trained_artifact_hash', item.artifactHash)
      .eq('status', item.fromStatus)
      .select('candidate_id')
    if (updated.error) throw updated.error
    if ((updated.data || []).length) synced.push(item.candidateId)
  }
  if (synced.length) {
    console.info('[cos-graduate-artifact-lifecycle-sync]', JSON.stringify({ synced: synced.length, candidates: synced.slice(0, 20) }))
  }
  return { synced: synced.length, candidates: synced.slice(0, 20) }
}

async function registerNextMassGraduate() {
  const db = cosServiceDb()
  if (!db) return { registered: false as const, reason: 'service_database_unavailable' }
  const artifacts = await db.from('cos_local_distillation_artifacts')
    .select('candidate_id,subject_id,student_model_id,trained_artifact_id,trained_artifact_hash,rollback_artifact_ref,status,created_at')
    .eq('status', 'runtime_pending')
    .like('candidate_id', 'mass:%')
    .order('created_at', { ascending: true })
    .limit(50)
  if (artifacts.error) throw artifacts.error
  const candidateIds = (artifacts.data || []).map((row: any) => String(row.candidate_id))
  if (!candidateIds.length) return { registered: false as const, reason: 'no_runtime_pending_mass_artifact' }

  const tracked = await db.from('cos_university_graduate_model_registry').select('candidate_id,trained_artifact_hash').in('candidate_id', candidateIds).limit(200)
  if (tracked.error) throw tracked.error
  const already = new Set((tracked.data || []).map((row: any) => `${row.candidate_id}:${String(row.trained_artifact_hash).toLowerCase()}`))

  const events = await db.from('cos_university_learning_assurance_events')
    .select('candidate_id,verifier,evidence')
    .eq('event_type', 'fine_tune')
    .in('candidate_id', candidateIds)
    .order('observed_at', { ascending: false })
    .limit(3000)
  if (events.error) throw events.error

  const decision = decideMassGraduateRegistration({
    enabled: String(process.env.COS_MASS_GRADUATE_REGISTRATION || '').trim() !== 'false',
    artifacts: (artifacts.data || [])
      .filter((row: any) => !already.has(`${row.candidate_id}:${String(row.trained_artifact_hash).toLowerCase()}`))
      .map((row: any) => ({
        candidateId: String(row.candidate_id), subjectId: String(row.subject_id || ''), studentModelId: String(row.student_model_id || ''),
        trainedArtifactId: String(row.trained_artifact_id || ''), trainedArtifactHash: String(row.trained_artifact_hash || ''),
        rollbackArtifactRef: row.rollback_artifact_ref ? String(row.rollback_artifact_ref) : null,
        status: String(row.status || ''), createdAt: String(row.created_at || ''),
      })),
    events: (events.data || []).map((row: any): MassGraduateEvent => ({
      candidateId: String(row.candidate_id), verifier: String(row.verifier || ''),
      evidence: row.evidence && typeof row.evidence === 'object' ? row.evidence : null,
    })),
  })
  if (!('artifact' in decision)) return { registered: false as const, reason: decision.reason }

  const registration = await registerPromotedGraduateModel({
    candidateId: decision.artifact.candidateId,
    subjectId: decision.artifact.subjectId,
    studentModelId: decision.artifact.studentModelId,
    trainedArtifactId: decision.artifact.trainedArtifactId,
    trainedArtifactHash: decision.artifact.trainedArtifactHash,
    rollbackArtifactRef: decision.artifact.rollbackArtifactRef,
    eligibleForPromotion: true,
    authorityExpanded: false,
    promotedAt: new Date(),
  })
  return {
    registered: registration.tracked === true,
    candidateId: decision.artifact.candidateId,
    artifactHash: decision.artifact.trainedArtifactHash,
    baselineScore: decision.baselineScore,
    trainedArtifactScore: decision.trainedArtifactScore,
    status: registration.status,
    blockers: registration.blockers,
    productionTrafficAuthorized: false,
  }
}

/**
 * Resolves the rollback target of the oldest pending graduate that has not been proven yet and records the result.
 * Read-only: it proves the reference exists, it does not perform a rollback and it changes no graduate status.
 */
async function proveNextGraduateRollback() {
  const db = cosServiceDb()
  if (!db) return { proven: false as const, reason: 'service_database_unavailable' }
  const graduates = await db.from('cos_university_graduate_model_registry')
    .select('candidate_id,subject_id,trained_artifact_hash,rollback_artifact_ref')
    .in('status', ['pending_runtime', 'canary', 'active'])
    .order('created_at', { ascending: true })
    .limit(50)
  if (graduates.error) throw graduates.error
  const rows = graduates.data || []
  if (!rows.length) return { proven: false as const, reason: 'no_registered_graduate' }

  const proven = await db.from('cos_university_learning_assurance_events')
    .select('candidate_id,evidence')
    .eq('event_type', 'fine_tune')
    .in('candidate_id', rows.map((row: any) => String(row.candidate_id)))
    .contains('evidence', { claim: GRADUATE_ROLLBACK_PROOF_CLAIM })
    .limit(200)
  if (proven.error) throw proven.error
  const done = new Set((proven.data || [])
    .filter((row: any) => row.evidence?.ok === true)
    .map((row: any) => `${row.candidate_id}:${String(row.evidence?.artifactHash || '').toLowerCase()}`))

  const next = rows.find((row: any) => !done.has(`${row.candidate_id}:${String(row.trained_artifact_hash).toLowerCase()}`))
  if (!next) return { proven: false as const, reason: 'every_graduate_rollback_already_proven' }

  const proof = await proveGraduateRollbackReference({ rollbackArtifactRef: next.rollback_artifact_ref })
  const evidence = {
    profile: GRADUATE_ROLLBACK_PROOF_PROFILE,
    claim: GRADUATE_ROLLBACK_PROOF_CLAIM,
    candidateId: String(next.candidate_id),
    artifactHash: String(next.trained_artifact_hash).toLowerCase(),
    ...proof,
    rollbackPerformed: false,
    productionTrafficAuthorized: false,
    authorityExpanded: false,
  }
  const evidenceHash = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
  const recorded = await db.from('cos_university_learning_assurance_events').upsert({
    event_key: createHash('sha256').update(JSON.stringify([GRADUATE_ROLLBACK_PROOF_PROFILE, next.candidate_id, evidence.artifactHash, evidenceHash])).digest('hex'),
    event_type: 'fine_tune',
    subject_id: String(next.subject_id || ''),
    candidate_id: String(next.candidate_id),
    evidence_hash: evidenceHash,
    evidence,
    verifier: 'host_production_verifier',
    observed_at: new Date().toISOString(),
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (recorded.error) throw recorded.error
  return { proven: proof.ok, candidateId: String(next.candidate_id), reason: proof.reason, resolvedRevision: proof.resolvedRevision, rollbackPerformed: false }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    // Registration is a durable record, not a runtime: it writes one pending_runtime row and spends nothing, so it
    // runs before the activation flag. Activation itself stays behind that flag and its own evidence gates.
    // Reconciliation is a bookkeeping write about an activation that ALREADY happened and behind its own
    // status guard, so like registration it runs before the activation flag and spends nothing.
    const lifecycleSync = await reconcileGraduateArtifactLifecycle()
    const massRegistration = await registerNextMassGraduate()
    const rollbackProof = await proveNextGraduateRollback()

    // Graduate activation and work assignment share one governed controller. Call it directly:
    // an internal HTTP hop can be intercepted by deployment routing/middleware and return a transport
    // 200 without ever executing the rotation handler.
    const rotation = await runGraduateRotationController()
    const workRotation: Record<string, unknown> = { ...rotation.body, httpStatus: rotation.status }
    console.info('[cos-graduate-work-rotation-direct]', JSON.stringify(workRotation))

    if (String(process.env[ACTIVATION_ENABLED_FLAG] || '').trim() !== 'true') {
      await recordCosUniversityProductionPath({
        path: 'graduate_runtime_activation',
        invocationSucceeded: true,
        evidence: {
          skipped: true,
          reason: 'graduate_activation_disabled',
          lifecycleSync,
          massRegistration,
          rollbackProof,
        },
      })
      return NextResponse.json({ ok: true, skipped: true, reason: 'graduate_activation_disabled', lifecycleSync, massRegistration, rollbackProof })
    }

    const db = cosServiceDb()
    if (!db) throw new Error('service_database_unavailable')

    let graduate: any = null
    let precomputedScopeDecision: Awaited<ReturnType<typeof resolveGraduateWorkerScope>> | null = null
    let primaryUpgrade: Record<string, unknown> = { considered: false, primaryGate: 'generalist_primary_disabled' }

    if (String(process.env[GENERALIST_PRIMARY_ENABLED_FLAG] || '').trim() === 'true') {
      primaryUpgrade = { considered: false, primaryGate: 'no_active_reasoning_graduate_awaiting_primary' }
      // A qualified COS-primary upgrade outranks ordinary pending specialist activation. Otherwise
      // a continually replenished specialist queue could leave COS nominally "the brain" forever.
      const active = await db.from('cos_university_graduate_model_registry')
        .select('candidate_id,subject_id,trained_artifact_hash,status,platform_scope,updated_at')
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(20)
      if (active.error) throw active.error
      const primaryCandidate = (active.data || []).find((row: any) =>
        canonicalGraduateSubjectId(row.subject_id) === 'reasoning_decision_science'
        && !activeWorkerRoles(row.platform_scope).includes('primary')) || null
      if (primaryCandidate) {
        const candidateScope = SUBJECT_WORKER_SCOPE.reasoning_decision_science
        const decision = await resolveGraduateWorkerScope('reasoning_decision_science', candidateScope)
        primaryUpgrade = { considered: true, candidateId: primaryCandidate.candidate_id, cosPrimary: decision.cosPrimary, primaryGate: decision.primaryGate, ...decision.gateEvidence }
        if (decision.cosPrimary) {
          graduate = primaryCandidate
          precomputedScopeDecision = decision
        }
      }
    }

    if (!graduate) {
      const pending = await db.from('cos_university_graduate_model_registry')
        .select('candidate_id,subject_id,trained_artifact_hash,status,platform_scope')
        .eq('status', 'pending_runtime')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (pending.error) throw pending.error
      graduate = pending.data || null
    }

    if (!graduate) {
      await recordCosUniversityProductionPath({
        path: 'graduate_runtime_activation',
        invocationSucceeded: true,
        evidence: {
          skipped: true,
          reason: 'no_pending_runtime_or_primary_upgrade_candidate',
          lifecycleSync,
          massRegistration,
          rollbackProof,
          primaryUpgrade,
        },
      })
      return NextResponse.json({ ok: true, skipped: true, reason: 'no_pending_runtime_or_primary_upgrade_candidate', primaryUpgrade, lifecycleSync, massRegistration, rollbackProof })
    }

    const canonicalSubjectId = canonicalGraduateSubjectId(graduate.subject_id)
    const baseScope = SUBJECT_WORKER_SCOPE[canonicalSubjectId]
    if (!baseScope) {
      // A subject without a declared scope is a decision, not a default. Record and stop.
      await recordCosUniversityProductionPath({
        path: 'graduate_runtime_activation',
        invocationSucceeded: false,
        evidence: { error: 'graduate_subject_scope_undeclared', subjectId: graduate.subject_id, canonicalSubjectId },
      })
      return NextResponse.json({ ok: false, error: 'graduate_subject_scope_undeclared', subjectId: graduate.subject_id, canonicalSubjectId }, { status: 422 })
    }

    const scopeDecision = precomputedScopeDecision
      ?? await resolveGraduateWorkerScope(canonicalSubjectId, baseScope)
    const scope = scopeDecision.scope
    if (graduate.status === 'active' && !scopeDecision.cosPrimary) {
      await recordCosUniversityProductionPath({
        path: 'graduate_runtime_activation',
        invocationSucceeded: true,
        evidence: {
          skipped: true,
          reason: scopeDecision.primaryGate,
          candidateId: graduate.candidate_id,
          subjectId: canonicalSubjectId,
          cosPrimary: false,
          lifecycleSync,
          massRegistration,
          rollbackProof,
        },
      })
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: scopeDecision.primaryGate,
        candidateId: graduate.candidate_id,
        massRegistration,
        rollbackProof,
      })
    }

    const serving = await resolvePendingGraduateServingIdentity(db, graduate)
    // The exact canary endpoint may have been retired to max=0 by later mass-evaluation capacity
    // rotation. Restore only this already-proven endpoint to the existing scale-to-zero/max-1
    // safety envelope. This creates no endpoint and does not widen the worker ceiling.
    const runtimePolicy = await ensureMassDistilledEndpoint24Gb(serving.endpointId)
    const result = await activateGraduateRuntime({
      candidateId: String(graduate.candidate_id || ''),
      trainedArtifactHash: String(graduate.trained_artifact_hash || ''),
      // The exact served identity comes from this artifact's passing host canary on the same
      // configured RunPod endpoint; never infer it from an artifact hash or a static legacy name.
      runtimeModelId: serving.modelId,
      runtimeBaseUrl: serving.baseUrl,
      runtimeProfile: 'graduate_ai',
      workerRoles: scope.workerRoles as never,
      problemClasses: scope.problemClasses,
      now: new Date(),
    })

    await recordCosUniversityProductionPath({
      path: 'graduate_runtime_activation',
      invocationSucceeded: true,
      evidence: {
        candidateId: graduate.candidate_id,
        subjectId: canonicalSubjectId,
        sourceSubjectId: graduate.subject_id,
        activated: result.activated,
        blockers: result.blockers,
        cosPrimary: scopeDecision.cosPrimary,
        primaryGate: scopeDecision.primaryGate,
        servingEndpointId: serving.endpointId,
        servingModelId: serving.modelId,
        servingBaseUrl: serving.baseUrl,
        servingWorkersMin: runtimePolicy.workersMin,
        servingWorkersMax: runtimePolicy.workersMax,
        ...(result.activated ? {
          provider: (result as any).provider,
          healthEvidenceHash: (result as any).healthEvidenceHash,
          activationEvidenceHash: (result as any).activationEvidenceHash,
        } : {}),
      },
    })

    return NextResponse.json({ ok: true, activated: result.activated, blockers: result.blockers, cosPrimary: scopeDecision.cosPrimary, primaryGate: scopeDecision.primaryGate })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordCosUniversityProductionPath({
      path: 'graduate_runtime_activation',
      invocationSucceeded: false,
      evidence: { error: message },
    }).catch(() => null)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
