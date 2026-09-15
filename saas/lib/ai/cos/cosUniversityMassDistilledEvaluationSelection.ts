import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

const EVALUATOR_VERSION = 'cos-mass-distilled-exact-artifact-evaluator-v1'
const MIN_RETENTION_DELAY_MS = 12 * 60 * 60 * 1000
const PAGE_SIZE = 100
const MASS_CANDIDATE = /^mass:([0-9a-f-]{36}):([a-f0-9]{16})$/i

function clean(value: unknown, max = 240): string {
  return String(value ?? '').trim().slice(0, max)
}

async function pageState(rows: any[]) {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const candidateIds = [...new Set(rows.map(row => clean(row.candidate_id, 140)).filter(Boolean))]
  if (!candidateIds.length) return { runByCandidate: new Map<string, any>(), evaluationByArtifact: new Map<string, any>() }

  const [runs, evaluations] = await Promise.all([
    db.from('cos_university_mass_distillation_batch_runs')
      .select('id,campaign_id,batch_key,candidate_id,subject_id,student_model_id,student_model_revision,teacher_model_id,dataset_hash,training_data_ref,holdout_data_ref,training_manifest_hash,holdout_manifest_hash,revision_key,trained_artifact_id,trained_artifact_hash,evidence_ref,rollback_artifact_ref,completed_at,stage')
      .in('candidate_id', candidateIds)
      .eq('stage', 'complete'),
    db.from('cos_university_distilled_evaluation_runs')
      .select('candidate_id,trained_artifact_hash,holdout_improved,safety_passed,unseen_transfer_passed,delayed_retention_passed,response_hashes,created_at,updated_at')
      .in('candidate_id', candidateIds)
      .eq('evaluator_version', EVALUATOR_VERSION)
      .order('created_at', { ascending: false })
      .limit(Math.max(PAGE_SIZE * 5, candidateIds.length * 5)),
  ])
  if (runs.error) throw runs.error
  if (evaluations.error) throw evaluations.error

  const runByCandidate = new Map<string, any>((runs.data || []).map((run: any) => [clean(run.candidate_id, 140), run]))
  const evaluationByArtifact = new Map<string, any>()
  for (const evaluation of evaluations.data || []) {
    const key = `${clean((evaluation as any).candidate_id, 140)}:${clean((evaluation as any).trained_artifact_hash, 64).toLowerCase()}`
    if (!evaluationByArtifact.has(key)) evaluationByArtifact.set(key, evaluation)
  }
  return { runByCandidate, evaluationByArtifact }
}

async function scan(mode: 'initial' | 'retention', now: Date) {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  let offset = 0
  let sawPending = false

  while (true) {
    const page = await db.from('cos_local_distillation_artifacts')
      .select('candidate_id,subject_id,student_model_id,teacher_model_id,trained_artifact_id,trained_artifact_hash,evidence_ref,revision_key,dataset_hash,rollback_artifact_ref,status,created_at')
      .eq('status', 'evaluation_pending')
      .like('candidate_id', 'mass:%')
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (page.error) throw page.error
    const rows: any[] = page.data || []
    if (!rows.length) return { selection: null, sawPending }
    sawPending = true

    const { runByCandidate, evaluationByArtifact } = await pageState(rows)
    for (const row of rows) {
      const candidateId = clean(row.candidate_id, 140)
      if (!MASS_CANDIDATE.test(candidateId)) continue
      const run: any = runByCandidate.get(candidateId)
      if (!run) continue
      const key = `${candidateId}:${clean(row.trained_artifact_hash, 64).toLowerCase()}`
      const prior: any = evaluationByArtifact.get(key)

      if (mode === 'initial') {
        if (!prior) return { selection: { artifact: row, run }, sawPending }
        continue
      }

      if (!prior) continue
      const retentionDeferred = prior?.response_hashes?.retention?.deferred === true
      if (prior.holdout_improved !== true || prior.safety_passed !== true || prior.unseen_transfer_passed !== true
        || prior.delayed_retention_passed === true || !retentionDeferred) continue
      const trainedAt = Date.parse(String(run.completed_at || row.created_at || ''))
      if (Number.isFinite(trainedAt) && now.getTime() >= trainedAt + MIN_RETENTION_DELAY_MS) {
        return { selection: { artifact: row, run }, sawPending }
      }
    }

    if (rows.length < PAGE_SIZE) return { selection: null, sawPending }
    offset += PAGE_SIZE
  }
}

export async function selectMassDistilledEvaluationArtifact(now = new Date()) {
  const initial = await scan('initial', now)
  if (initial.selection) return { selection: initial.selection, pendingMass: true }
  const retention = await scan('retention', now)
  if (retention.selection) return { selection: retention.selection, pendingMass: true }
  return { selection: null, pendingMass: initial.sawPending || retention.sawPending }
}
