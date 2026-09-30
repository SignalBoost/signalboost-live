import { cosServiceDb } from '../../cos-core/storage/service-db.ts'

const HEX40=/^[a-f0-9]{40}$/i
const HEX64=/^[a-f0-9]{64}$/i
const WORKING=/^working-cos:[a-f0-9]{32}$/i
const clean=(v:unknown,n=2000)=>String(v??'').trim().slice(0,n)

export type WorkingCosEvaluationAdmission=Readonly<{
  candidateId:string; subjectId:'Working COS Generalist'; artifactId:string; artifactRevision:string; artifactHash:string;
  revisionKey:string; datasetHash:string; baseModelId:string; baseModelRevision:string;
  holdoutDataRef:string; holdoutManifestHash:string; rollbackArtifactRef:string;
}>

/**
 * Fail-closed bridge from a successfully trained Working-COS adapter into independent evaluation.
 * This function grants no traffic, activation, graduation or spending authority. It only reconstructs
 * the immutable evaluation inputs from already-admitted training evidence and proves that the artifact
 * library row is still evaluation_pending.
 */
export async function readWorkingCosEvaluationAdmission(input:{candidateId:string;artifactHash:string;db?:any}):Promise<WorkingCosEvaluationAdmission>{
  const candidateId=clean(input.candidateId,160)
  const artifactHash=clean(input.artifactHash,64).toLowerCase()
  if(!WORKING.test(candidateId)||!HEX64.test(artifactHash))throw new Error('working_cos_evaluation_identity_invalid')
  const db=input.db||cosServiceDb();if(!db)throw new Error('service_database_unavailable')

  const artifact=await db.from('cos_local_distillation_artifacts')
    .select('candidate_id,subject_id,status,student_model_id,trained_artifact_id,trained_artifact_hash,revision_key,dataset_hash,rollback_artifact_ref,intended_use,authority_expanded')
    .eq('candidate_id',candidateId).eq('trained_artifact_hash',artifactHash).maybeSingle()
  if(artifact.error)throw artifact.error
  const a:any=artifact.data
  if(!a||a.status!=='evaluation_pending'||a.authority_expanded===true)throw new Error('working_cos_evaluation_artifact_not_pending')
  if(clean(a.subject_id,240)!=='Working COS Generalist')throw new Error('working_cos_evaluation_subject_invalid')
  if(a.intended_use?.trainingMode!=='working_cos_supervised_distillation'||a.intended_use?.trafficAuthorized!==false)throw new Error('working_cos_evaluation_training_contract_invalid')

  const evidence=await db.from('cos_university_learning_assurance_events')
    .select('evidence,observed_at').eq('candidate_id',candidateId).eq('event_type','fine_tune')
    .eq('verifier','training_executor').order('observed_at',{ascending:false}).limit(100)
  if(evidence.error)throw evidence.error
  const rows=(evidence.data||[]).map((r:any)=>r.evidence||{})
  const partition=rows.find((e:any)=>e.claim==='partition_manifests_registered'&&e.candidateId===candidateId)
  const trained=rows.find((e:any)=>e.claim==='trained_artifact_registered'&&e.candidateId===candidateId&&clean(e.artifactHash,64).toLowerCase()===artifactHash)
  const rollback=rows.find((e:any)=>e.claim==='rollback_artifact_registered'&&e.candidateId===candidateId&&clean(e.artifactHash,64).toLowerCase()===artifactHash)
  if(!partition||!trained||!rollback)throw new Error('working_cos_evaluation_training_evidence_incomplete')

  const revisionKey=clean(a.revision_key,64).toLowerCase(),datasetHash=clean(a.dataset_hash,64).toLowerCase()
  const baseModelId=clean(trained.baseModel,500),baseModelRevision=clean(trained.baseModelRevision,40).toLowerCase()
  const holdoutDataRef=clean(partition.holdoutDataRef,2000),holdoutManifestHash=clean(partition.holdoutManifestHash,64).toLowerCase()
  const artifactId=clean(a.trained_artifact_id,500),artifactEvidenceRef=clean(trained.evidenceRef,2000),rollbackArtifactRef=clean(a.rollback_artifact_ref,2000)
  if(!HEX64.test(revisionKey)||!HEX64.test(datasetHash)||!HEX40.test(baseModelRevision)||!HEX64.test(holdoutManifestHash))throw new Error('working_cos_evaluation_revision_invalid')
  if(clean(partition.revisionKey,64).toLowerCase()!==revisionKey||clean(trained.revisionKey,64).toLowerCase()!==revisionKey||clean(rollback.revisionKey,64).toLowerCase()!==revisionKey)throw new Error('working_cos_evaluation_revision_mismatch')
  if(clean(partition.datasetHash,64).toLowerCase()!==datasetHash||clean(trained.datasetHash,64).toLowerCase()!==datasetHash)throw new Error('working_cos_evaluation_dataset_mismatch')
  if(clean(trained.trainedArtifactId,500)!==artifactId)throw new Error('working_cos_evaluation_artifact_mismatch')
  const artifactRefMatch=/^hf:\/\/models\/[^@]+@([a-f0-9]{40})$/i.exec(artifactEvidenceRef)
  if(!artifactRefMatch)throw new Error('working_cos_evaluation_artifact_revision_missing')
  const artifactRevision=artifactRefMatch[1].toLowerCase()
  if(clean(rollback.rollbackArtifactRef,2000)!==rollbackArtifactRef)throw new Error('working_cos_evaluation_rollback_mismatch')
  if(!/^hf:\/\/datasets\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[a-f0-9]{40}#holdout$/i.test(holdoutDataRef))throw new Error('working_cos_evaluation_holdout_ref_invalid')

  return Object.freeze({candidateId,subjectId:'Working COS Generalist',artifactId,artifactRevision,artifactHash,revisionKey,datasetHash,baseModelId,baseModelRevision,holdoutDataRef,holdoutManifestHash,rollbackArtifactRef})
}
