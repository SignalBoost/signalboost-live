import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { decideControlledFineTune } from './cosUniversityLearningAssurance.ts'
import { buildFineTuneEvidenceInput, readFineTuneEvidence, readFineTunePartitionRevision } from './cosUniversityFineTuneEvidence.ts'
import { decideModelDistillationPromotion } from './cosUniversityModelDistillation.ts'
import { readCosUniversityArtifactTrainingMode } from './cosUniversityDistillationPromotionEvidence.ts'
import { controlledFineTuneDatasetHash } from './cosUniversityTrainingIdentity.ts'

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/**
 * Builds and records bounded fine-tuning candidates. Training remains impossible until separate
 * host approvals and independent post-training evidence exist. Distilled artifacts never inherit
 * ordinary fine-tune promotion: they must also satisfy the distillation-specific promotion gate.
 */
export async function runCosUniversityControlledFineTuning(now = new Date()) {
  if (process.env.COS_UNIVERSITY_FINE_TUNING_ENABLED !== 'true') {
    return { enabled: false, considered: 0, recorded: 0, eligibleForTraining: 0, semantics: 'fine_tuning_fail_closed' }
  }
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const plans = await db.from('cos_university_study_plans')
    .select('id,plan_key,subject_id,failure_class,objective,methods,source_ref,attempt_count,updated_at')
    .eq('fine_tune_candidate', true)
    .in('status', ['queued', 'studying', 'ready_for_exam'])
    .order('priority', { ascending: false })
    .limit(5)
  if (plans.error) throw plans.error

  let recorded = 0
  let eligibleForTraining = 0
  const candidates = []
  for (const plan of plans.data || []) {
    const candidateId = `study-plan:${plan.id}`
    const datasetHash = controlledFineTuneDatasetHash(plan)
    const revision = await readFineTunePartitionRevision(candidateId, datasetHash, now)
    const recordedEvidence = revision ? await readFineTuneEvidence(candidateId, revision, now) : null
    const evidenceInput = buildFineTuneEvidenceInput(revision || {
      baseModel: process.env.LOCAL_AI_MODEL || 'runtime-model-unspecified', datasetHash,
      trainingManifestHash: '', holdoutManifestHash: '',
    }, recordedEvidence || { claims: [], trainedArtifactId: '', trainedArtifactHash: '', rollbackArtifactRef: null, baselineScore: 0, trainedArtifactScore: 0 })
    const controlledDecision = decideControlledFineTune(evidenceInput)
    let decision = controlledDecision
    let trainingMode: 'fine_tune' | 'distillation' | 'unknown' | null = null

    if (revision && recordedEvidence?.trainedArtifactId && recordedEvidence.trainedArtifactHash) {
      const artifactMode = await readCosUniversityArtifactTrainingMode({
        candidateId,
        revision,
        trainedArtifactId: recordedEvidence.trainedArtifactId,
        trainedArtifactHash: recordedEvidence.trainedArtifactHash,
        now,
      })
      trainingMode = artifactMode.mode
      if (artifactMode.mode === 'distillation') {
        const context = artifactMode.distillation
        if (!context?.candidate) {
          decision = {
            ...controlledDecision,
            eligibleForPromotion: false,
            blockers: [...new Set([...controlledDecision.blockers, 'distillation_candidate_binding_missing'])],
          }
        } else {
          const distillationDecision = decideModelDistillationPromotion({
            candidate: context.candidate,
            controlledFineTuneEvidence: evidenceInput,
            independentEvaluatorId: context.independentEvaluatorId,
            teacherModelIdUsedAsEvaluator: context.teacherModelIdUsedAsEvaluator,
            verifiedSourceAttribution: context.verifiedSourceAttribution,
            authorityExpanded: context.authorityExpanded,
          })
          decision = {
            ...controlledDecision,
            eligibleForPromotion: distillationDecision.eligibleForPromotion,
            blockers: distillationDecision.blockers,
          }
        }
      } else if (artifactMode.mode !== 'fine_tune') {
        decision = {
          ...controlledDecision,
          eligibleForPromotion: false,
          blockers: [...new Set([...controlledDecision.blockers, 'training_mode_not_proven'])],
        }
      }
    }

    if (decision.eligibleForTraining) eligibleForTraining += 1
    const evidence = {
      claim: 'candidate_status_observed', candidateId, planId: plan.id, datasetHash,
      lifecycleStage: decision.stage, trainedArtifactPresent: Boolean(recordedEvidence?.trainedArtifactId),
      trainingMode,
      trainingManifestHash: revision?.trainingManifestHash || null, holdoutManifestHash: revision?.holdoutManifestHash || null,
      decision, recordedClaims: recordedEvidence?.claims || [],
    }
    const evidenceHash = hash(evidence)
    const eventKey = hash(['controlled-fine-tuning-v1', candidateId, plan.updated_at, evidenceHash])
    const inserted = await db.from('cos_university_learning_assurance_events').upsert({
      event_key: eventKey,
      event_type: 'fine_tune',
      subject_id: plan.subject_id,
      candidate_id: candidateId,
      evidence_hash: evidenceHash,
      evidence,
      verifier: 'host_controller',
      observed_at: now.toISOString(),
    }, { onConflict: 'event_key', ignoreDuplicates: true })
    if (inserted.error) throw inserted.error
    recorded += 1
    candidates.push({
      candidateId,
      stage: decision.stage,
      trainingMode,
      eligibleForTraining: decision.eligibleForTraining,
      eligibleForPromotion: decision.eligibleForPromotion,
      blockers: decision.blockers,
    })
  }
  return {
    enabled: true, considered: (plans.data || []).length, recorded, eligibleForTraining, candidates,
    semantics: 'candidate_packaging_only_training_requires_separate_host_approvals',
  }
}
