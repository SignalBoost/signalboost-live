import { tryCOSFirstAnswer } from '@/lib/ai/cos/cosFirstAnswerEnterprise'
import { beginEvidenceSourceUseTurn, peekEvidenceSourceUseTurnId } from '@/lib/ai/cos/evidenceSourceUseTurnContext'
import { flushCapturedEvidenceSourceUse } from '@/lib/ai/cos/evidenceSourceUseStore'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { buildCosUniversityARangeExam, COS_UNIVERSITY_A_RANGE_SCORER, scoreCosUniversityARangeExam, universityARangeValidUntil } from './cosUniversityARange.ts'
import { recordCosUniversityAssessment } from './cosUniversityStore.ts'
import { COS_UNIVERSITY_RETENTION_PROFILE, selectDueCosUniversityRetention, type CosUniversityRetentionSource } from './cosUniversityRetention.ts'

export async function runCosUniversityRetention(): Promise<Record<string, unknown>> {
  if (process.env.COS_UNIVERSITY_RETENTION_ENABLED !== 'true') return { enabled: false, attempted: 0 }
  const db = cosServiceDb()
  if (!db) return { enabled: true, attempted: 0, errors: ['service_database_unavailable'] }

  const [sourceResult, completedResult] = await Promise.all([
    db.from('cos_university_a_range_runs')
      .select('id,subject_id,seed,manifest_hash,passed,observed_at')
      .eq('agent_id', 'cos').eq('target_kind', 'subject').eq('stage', 'cross_domain_transfer')
      .eq('status', 'passed').order('observed_at', { ascending: true }).limit(5000),
    db.from('cos_university_retention_runs').select('source_run_id').eq('agent_id', 'cos').limit(5000),
  ])
  if (sourceResult.error) throw sourceResult.error
  if (completedResult.error) throw completedResult.error
  const sources = (sourceResult.data || []).map(row => ({
    id: row.id, subjectId: row.subject_id, seed: row.seed, manifestHash: row.manifest_hash,
    passed: row.passed, observedAt: row.observed_at,
  })) as CosUniversityRetentionSource[]
  const completed = new Set((completedResult.data || []).map(row => String(row.source_run_id)))
  const source = selectDueCosUniversityRetention(sources, completed, new Date())
  if (!source) return { enabled: true, attempted: 0, status: 'nothing_due' }

  const exam = buildCosUniversityARangeExam({ seed: source.seed, stage: 'cross_domain_transfer', subjectId: source.subjectId })
  if (exam.manifestHash !== source.manifestHash) throw new Error('retention_source_manifest_drift')
  const inserted = await db.from('cos_university_retention_runs').insert({
    run_key: `${COS_UNIVERSITY_RETENTION_PROFILE}:${source.id}`,
    agent_id: 'cos', subject_id: source.subjectId, source_run_id: source.id,
    profile: COS_UNIVERSITY_RETENTION_PROFILE, scorer_version: COS_UNIVERSITY_A_RANGE_SCORER,
    source_manifest_hash: source.manifestHash, status: 'running',
  }).select('id').maybeSingle()
  if (inserted.error) throw inserted.error
  if (!inserted.data) return { enabled: true, attempted: 0, status: 'concurrent_claim' }

  beginEvidenceSourceUseTurn()
  const result = await tryCOSFirstAnswer({ prompt: exam.prompt, language: 'en', privileged: true, disableCache: true })
  const turnId = peekEvidenceSourceUseTurnId()
  const reply = result.handled ? result.reply : ('bestEffortReply' in result ? result.bestEffortReply ?? '' : '')
  const score = scoreCosUniversityARangeExam(exam, reply, {
    handled: result.handled, localReasoning: result.provenance.localModelInvoked,
    externalAi: result.provenance.externalAiInvoked,
    semanticCache: result.provenance.responseSource === 'semantic_cache' || result.provenance.responseSource === 'semantic_similarity',
    turnId,
  })
  flushCapturedEvidenceSourceUse()
  const fresh = Boolean(result.handled && result.provenance.localModelInvoked && !result.provenance.externalAiInvoked && turnId)
  const status = fresh ? (score.passed ? 'passed' : 'failed') : 'error'
  const reasons = fresh ? score.reasons : [...score.reasons, 'fresh_execution_required']
  const observedAt = new Date()
  const update = await db.from('cos_university_retention_runs').update({
    status, passed: fresh ? score.passed : null, turn_id: turnId || null, reasons,
    observed_at: observedAt.toISOString(), completed_at: observedAt.toISOString(), updated_at: observedAt.toISOString(),
  }).eq('id', inserted.data.id)
  if (update.error) throw update.error
  const assessmentRecorded = fresh && await recordCosUniversityAssessment({
    assessmentKey: `cos-university-retention:${inserted.data.id}`, subjectId: source.subjectId,
    kind: 'delayed_retention', passed: score.passed, independentScorer: true,
    scorerVersion: COS_UNIVERSITY_A_RANGE_SCORER, scorerAuthority: 'host_private_exam',
    sourceRef: `cos_university_a_range:${source.id}`,
    evidence: { sourceRunId: source.id, sourceManifestHash: source.manifestHash, retentionOnly: true, turnId },
    observedAt: observedAt.toISOString(), validUntil: universityARangeValidUntil('cross_domain_transfer', observedAt),
  })
  return { enabled: true, attempted: 1, status, passed: fresh ? score.passed : null, assessmentRecorded, reasons }
}
