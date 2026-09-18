import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { FINE_TUNE_EVIDENCE_PROFILE } from './cosUniversityFineTuneEvidence.ts'
import { decideLocalDistillationLifecycle } from './cosLocalDistillationPolicy.ts'

export const COS_LOCAL_DISTILLATION_ARTIFACT_VERSION = 'cos-local-distillation-artifact-v1' as const

const HEX64 = /^[a-f0-9]{64}$/i

function clean(value: unknown, limit = 2000): string {
  return String(value ?? '').trim().slice(0, limit)
}

function validAt(row: any, now: Date): boolean {
  const observedAt = Date.parse(String(row?.observed_at || ''))
  return Number.isFinite(observedAt)
    && observedAt <= now.getTime()
    && (!row?.expires_at || Date.parse(String(row.expires_at)) > now.getTime())
}

function exactArtifact(evidence: any, artifactHash: string, revisionKey: string): boolean {
  return clean(evidence?.artifactHash, 64).toLowerCase() === artifactHash
    && clean(evidence?.revisionKey, 64).toLowerCase() === revisionKey
}

/**
 * Turn authoritative training-executor evidence into an iTMounts-owned local-runtime artifact record.
 * This deliberately does not promote or activate the model. It only prevents completed distillation
 * from becoming a stranded provider artifact while the independent promotion gates continue to run.
 */
export async function reconcileLocalDistillationCandidate(candidateIdInput: string, now = new Date()) {
  const candidateId = clean(candidateIdInput, 240)
  if (!candidateId) return { tracked: false as const, reason: 'candidate_missing' as const }
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')

  const events = await db.from('cos_university_learning_assurance_events')
    .select('subject_id,evidence,verifier,observed_at,expires_at')
    .eq('event_type', 'fine_tune')
    .eq('candidate_id', candidateId)
    .order('observed_at', { ascending: false })
    .limit(300)
  if (events.error) throw events.error

  const valid = (events.data || []).filter(row => validAt(row, now))
  const trained = valid.find(row => {
    const evidence: any = row.evidence
    return row.verifier === 'training_executor'
      && evidence?.profile === FINE_TUNE_EVIDENCE_PROFILE
      && evidence?.claim === 'trained_artifact_registered'
      && evidence?.trainingMode === 'distillation'
      && evidence?.authorityExpanded === false
  })
  if (!trained) return { tracked: false as const, reason: 'distilled_artifact_missing' as const }

  const trainedEvidence: any = trained.evidence
  const trainedArtifactId = clean(trainedEvidence?.trainedArtifactId, 500)
  const trainedArtifactHash = clean(trainedEvidence?.artifactHash, 64).toLowerCase()
  const evidenceRef = clean(trainedEvidence?.evidenceRef, 2000)
  const revisionKey = clean(trainedEvidence?.revisionKey, 64).toLowerCase()
  const studentModelId = clean(trainedEvidence?.distillationCandidate?.studentModelId, 240)
  const teacherModelId = clean(trainedEvidence?.distillationCandidate?.teacherModelId, 240)
  if (!trainedArtifactId || !evidenceRef || !studentModelId || !HEX64.test(trainedArtifactHash) || !HEX64.test(revisionKey)) {
    throw new Error('local_distillation_artifact_identity_invalid')
  }

  // The authoritative dataset identity is registered when train/holdout partitions are created,
  // before the final trained-artifact callback. Some training executors intentionally omit it from
  // the later artifact event, so bind by the exact revision key rather than treating absence there as
  // missing provenance or hard-coding a dataset hash.
  const partition = valid.find(row => {
    const evidence: any = row.evidence
    return row.verifier === 'training_executor'
      && evidence?.profile === FINE_TUNE_EVIDENCE_PROFILE
      && evidence?.claim === 'partition_manifests_registered'
      && clean(evidence?.revisionKey, 64).toLowerCase() === revisionKey
      && HEX64.test(clean(evidence?.datasetHash, 64))
  })
  const datasetHash = clean(trainedEvidence?.datasetHash || (partition?.evidence as any)?.datasetHash, 64).toLowerCase()

  const rollback = valid.find(row => {
    const evidence: any = row.evidence
    return row.verifier === 'training_executor'
      && evidence?.profile === FINE_TUNE_EVIDENCE_PROFILE
      && evidence?.claim === 'rollback_artifact_registered'
      && exactArtifact(evidence, trainedArtifactHash, revisionKey)
  })
  const rollbackArtifactRef = clean((rollback?.evidence as any)?.rollbackArtifactRef, 2000) || null

  const graduate = await db.from('cos_university_graduate_model_registry')
    .select('status')
    .eq('candidate_id', candidateId)
    .eq('trained_artifact_hash', trainedArtifactHash)
    .maybeSingle()
  if (graduate.error) throw graduate.error
  const current = await db.from('cos_local_distillation_artifacts')
    .select('status')
    .eq('candidate_id', candidateId)
    .eq('trained_artifact_hash', trainedArtifactHash)
    .maybeSingle()
  if (current.error) throw current.error
  const lifecycle = decideLocalDistillationLifecycle(
    (graduate.data as any)?.status,
    Boolean(rollbackArtifactRef),
    (current.data as any)?.status,
  )

  const result = await db.from('cos_local_distillation_artifacts').upsert({
    candidate_id: candidateId,
    subject_id: trained.subject_id || null,
    student_model_id: studentModelId,
    teacher_model_id: teacherModelId || null,
    trained_artifact_id: trainedArtifactId,
    trained_artifact_hash: trainedArtifactHash,
    evidence_ref: evidenceRef,
    revision_key: revisionKey,
    dataset_hash: HEX64.test(datasetHash) ? datasetHash : null,
    rollback_artifact_ref: rollbackArtifactRef,
    status: lifecycle.status,
    runtime_target: 'itmounts_local',
    runtime_preference: 'runpod_serverless_primary_deepinfra_fallback',
    artifact_kind: 'lora_adapter',
    intended_use: {
      profile: COS_LOCAL_DISTILLATION_ARTIFACT_VERSION,
      owner: 'itmounts',
      canonicalBaseModel: studentModelId,
      adapterModel: trainedArtifactId,
      teacherModel: teacherModelId || null,
      trafficAuthorized: lifecycle.trafficAuthorized,
      nextGate: lifecycle.nextGate,
    },
    authority_expanded: false,
    updated_at: now.toISOString(),
  }, { onConflict: 'candidate_id,trained_artifact_hash' })
  if (result.error) throw result.error

  return {
    tracked: true as const,
    candidateId,
    subjectId: trained.subject_id || null,
    studentModelId,
    teacherModelId: teacherModelId || null,
    trainedArtifactId,
    trainedArtifactHash,
    datasetHash: HEX64.test(datasetHash) ? datasetHash : null,
    rollbackReady: Boolean(rollbackArtifactRef),
    status: lifecycle.status,
    runtimeTarget: 'itmounts_local' as const,
    runtimePreference: 'runpod_serverless_primary_deepinfra_fallback' as const,
    trafficAuthorized: lifecycle.trafficAuthorized,
    nextGate: lifecycle.nextGate,
  }
}

/** Non-spending reconciliation. It may create local artifact records but never dispatch training. */
export async function reconcileLocalDistillationArtifacts(now = new Date(), limit = 250) {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const boundedLimit = Math.max(1, Math.min(1000, Math.floor(limit)))
  const rows = await db.from('cos_university_learning_assurance_events')
    .select('candidate_id,observed_at')
    .eq('event_type', 'fine_tune')
    .eq('verifier', 'training_executor')
    .contains('evidence', {
      profile: FINE_TUNE_EVIDENCE_PROFILE,
      claim: 'trained_artifact_registered',
      trainingMode: 'distillation',
    })
    .order('observed_at', { ascending: false })
    .limit(boundedLimit)
  if (rows.error) throw rows.error

  const candidateIds = [...new Set((rows.data || []).map(row => clean(row.candidate_id, 240)).filter(Boolean))]
  let tracked = 0
  const artifacts = []
  for (const candidateId of candidateIds) {
    const result = await reconcileLocalDistillationCandidate(candidateId, now)
    if (result.tracked) tracked += 1
    artifacts.push(result)
  }
  return {
    considered: candidateIds.length,
    tracked,
    artifacts,
    semantics: 'non_spending_local_artifact_reconciliation_no_traffic_authorization' as const,
  }
}
