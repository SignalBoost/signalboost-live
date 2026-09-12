// saas/lib/ai/cos/cosUniversityRetentionRunner.ts
import { tryCOSFirstAnswer } from '@/lib/ai/cos/cosFirstAnswerEnterprise'
import { beginEvidenceSourceUseTurn, peekEvidenceSourceUseTurnId } from '@/lib/ai/cos/evidenceSourceUseTurnContext'
import { flushCapturedEvidenceSourceUse } from '@/lib/ai/cos/evidenceSourceUseStore'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { cosUniversityAcademicExecutionBlocker } from './cosUniversityAcademicExecutionPolicy.ts'
import { type AgentCapstoneExecution } from './cosUniversityAgentCapstone.ts'
import { executeBoundAgentExam, hasBoundAcademicExecutor } from './cosUniversityAgentExamRuntime.ts'
import { buildCosUniversityARangeExam, COS_UNIVERSITY_A_RANGE_SCORER, scoreCosUniversityARangeExam, universityARangeValidUntil } from './cosUniversityARange.ts'
import { recordCosUniversityAssessment } from './cosUniversityStore.ts'
import { COS_UNIVERSITY_RETENTION_PROFILE, selectDueCosUniversityRetention, type CosUniversityRetentionSource } from './cosUniversityRetention.ts'

const DEFAULT_AGENT_ID = 'cos'

/**
 * Delayed retention for one registered agent. It replays only that agent's own previously passed
 * transfer case, after the fixed delay, and records the result under that agent's identity.
 */
export async function runCosUniversityRetention(options: { now?: Date; agentId?: string } = {}): Promise<Record<string, unknown>> {
  const agentId = String(options.agentId || DEFAULT_AGENT_ID).trim()
  const now = options.now instanceof Date ? options.now : new Date()
  if (process.env.COS_UNIVERSITY_RETENTION_ENABLED !== 'true') return { enabled: false, agentId, attempted: 0 }
  if (!agentId) return { enabled: true, agentId, attempted: 0, errors: ['agent_id_required'] }
  // COS uses its own reasoner; any other agent needs its own bound executor before it can be graded.
  let blocked = cosUniversityAcademicExecutionBlocker(agentId)
  if (blocked && await hasBoundAcademicExecutor(agentId).catch(() => false)) blocked = null
  if (blocked) return { enabled: true, agentId, attempted: 0, status: 'blocked', blocked }
  const db = cosServiceDb()
  if (!db) return { enabled: true, agentId, attempted: 0, errors: ['service_database_unavailable'] }

  const [sourceResult, completedResult] = await Promise.all([
    db.from('cos_university_a_range_runs')
      .select('id,subject_id,seed,manifest_hash,passed,observed_at')
      .eq('agent_id', agentId).eq('target_kind', 'subject').eq('stage', 'cross_domain_transfer')
      .eq('status', 'passed').order('observed_at', { ascending: true }).limit(5000),
    db.from('cos_university_retention_runs').select('source_run_id').eq('agent_id', agentId).limit(5000),
  ])
  if (sourceResult.error) throw sourceResult.error
  if (completedResult.error) throw completedResult.error
  const sources = (sourceResult.data || []).map(row => ({
    id: row.id, subjectId: row.subject_id, seed: row.seed, manifestHash: row.manifest_hash,
    passed: row.passed, observedAt: row.observed_at,
  })) as CosUniversityRetentionSource[]
  const completed = new Set((completedResult.data || []).map(row => String(row.source_run_id)))
  const source = selectDueCosUniversityRetention(sources, completed, now)
  if (!source) return { enabled: true, agentId, attempted: 0, status: 'nothing_due' }

  const exam = buildCosUniversityARangeExam({ seed: source.seed, stage: 'cross_domain_transfer', subjectId: source.subjectId })
  if (exam.manifestHash !== source.manifestHash) throw new Error('retention_source_manifest_drift')
  const inserted = await db.from('cos_university_retention_runs').insert({
    run_key: `${COS_UNIVERSITY_RETENTION_PROFILE}:${source.id}`,
    agent_id: agentId, subject_id: source.subjectId, source_run_id: source.id,
    profile: COS_UNIVERSITY_RETENTION_PROFILE, scorer_version: COS_UNIVERSITY_A_RANGE_SCORER,
    source_manifest_hash: source.manifestHash, status: 'running',
  }).select('id').maybeSingle()
  if (inserted.error) throw inserted.error
  if (!inserted.data) return { enabled: true, agentId, attempted: 0, status: 'concurrent_claim' }

  let reply = ''
  let turnId: string | null = null
  let localModelInvoked = false
  let externalAiInvoked = false
  let semanticCache = false
  let handled = false
  let executionProvenance: AgentCapstoneExecution | null = null

  // A registered agent with its own bound executor re-answers its own passed transfer case as itself,
  // through its assigned model. COS keeps its existing reasoner path unchanged.
  if (agentId !== DEFAULT_AGENT_ID) {
    const bound = await executeBoundAgentExam(
      { agentId, runId: inserted.data.id, manifestHash: source.manifestHash, prompt: exam.prompt },
      { subjectId: source.subjectId },
    )
    const execution = bound.execution
    if (execution.agentId !== agentId || execution.runId !== inserted.data.id || execution.manifestHash !== source.manifestHash) {
      throw new Error('agent_execution_identity_mismatch')
    }
    reply = bound.reply
    turnId = execution.turnId
    localModelInvoked = true
    handled = true
    executionProvenance = execution
  } else {
    beginEvidenceSourceUseTurn()
    const result = await tryCOSFirstAnswer({ prompt: exam.prompt, language: 'en', privileged: true, disableCache: true })
    turnId = peekEvidenceSourceUseTurnId()
    reply = result.handled ? result.reply : ('bestEffortReply' in result ? result.bestEffortReply ?? '' : '')
    localModelInvoked = Boolean(result.provenance.localModelInvoked)
    externalAiInvoked = Boolean(result.provenance.externalAiInvoked)
    semanticCache = result.provenance.responseSource === 'semantic_cache' || result.provenance.responseSource === 'semantic_similarity'
    handled = result.handled
    flushCapturedEvidenceSourceUse()
  }

  const score = scoreCosUniversityARangeExam(exam, reply, {
    handled, localReasoning: localModelInvoked, externalAi: externalAiInvoked, semanticCache, turnId,
  })
  const fresh = Boolean(handled && localModelInvoked && !externalAiInvoked && !semanticCache && turnId)
  const status = fresh ? (score.passed ? 'passed' : 'failed') : 'error'
  const reasons = fresh ? score.reasons : [...score.reasons, 'fresh_execution_required']
  const observedAt = new Date()
  const update = await db.from('cos_university_retention_runs').update({
    status, passed: fresh ? score.passed : null, turn_id: turnId || null, reasons,
    execution_provenance: executionProvenance,
    observed_at: observedAt.toISOString(), completed_at: observedAt.toISOString(), updated_at: observedAt.toISOString(),
  }).eq('id', inserted.data.id)
  if (update.error) throw update.error
  const assessmentRecorded = fresh && await recordCosUniversityAssessment({
    assessmentKey: `cos-university-retention:${inserted.data.id}`, agentId, subjectId: source.subjectId,
    kind: 'delayed_retention', passed: score.passed, independentScorer: true,
    scorerVersion: COS_UNIVERSITY_A_RANGE_SCORER, scorerAuthority: 'host_private_exam',
    sourceRef: `cos_university_a_range:${source.id}`,
    evidence: { sourceRunId: source.id, sourceManifestHash: source.manifestHash, retentionOnly: true, turnId, executionProvenance },
    observedAt: observedAt.toISOString(), validUntil: universityARangeValidUntil('cross_domain_transfer', observedAt),
  })
  return { enabled: true, agentId, attempted: 1, status, passed: fresh ? score.passed : null, assessmentRecorded, reasons }
}
