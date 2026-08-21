import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { COS_EVIDENCE_UTILIZATION_BENCHMARK } from '@/lib/ai/cos/evidenceUtilizationBenchmark'
import { classifyProblemClass } from '@/lib/ai/cos/cosProblemClass'
import { runPrivateCapabilityCase } from '@/lib/ai/cos/capabilityBenchmarkRunner'
import {
  retainedLessonAfterRetest,
  selectFailureAutopsyRetestCase,
  type FailureAutopsyRetestCandidate,
} from '@/lib/ai/cos/failureAutopsyPolicy'

export type FailureAutopsyStage =
  | 'retrieval'
  | 'evidence_selection'
  | 'reasoning'
  | 'grounding'
  | 'calibration'
  | 'tool_execution'
  | 'stale_or_missing_knowledge'

export type FailureAutopsyStatus =
  | 'awaiting_evidence'
  | 'retest_pending'
  | 'retest_running'
  | 'retest_passed'
  | 'retest_failed'
  | 'insufficient_evidence'

export type FailureAutopsyRow = {
  id: string
  turn_id: string
  problem_class: string
  primary_stage: FailureAutopsyStage | null
  stage_candidates: unknown
  observed_evidence: unknown
  falsifier: string | null
  corrective_guidance: string | null
  outcome_source: string | null
  outcome_at: string | null
  source_case_id: string | null
  status: FailureAutopsyStatus
  retest_case_id: string | null
  retest_turn_id: string | null
  retest_passed: boolean | null
  retest_at: string | null
  lesson_retained: boolean
  created_at: string
  updated_at: string
}

const CONTROLLED_RETEST_CANDIDATES: FailureAutopsyRetestCandidate[] = COS_EVIDENCE_UTILIZATION_BENCHMARK.map(test => ({
  id: test.id,
  domain: test.domain,
  problemClass: classifyProblemClass(test.prompt),
}))

export async function readFailureAutopsyReport(limit = 50) {
  const db = cosServiceDb()
  if (!db) return { ok: false as const, error: 'COS service database is not configured.' }

  const bounded = Math.max(1, Math.min(200, Math.floor(limit)))
  const result = await db.from('cos_turn_failure_autopsies')
    .select('id,turn_id,problem_class,primary_stage,stage_candidates,observed_evidence,falsifier,corrective_guidance,outcome_source,outcome_at,source_case_id,status,retest_case_id,retest_turn_id,retest_passed,retest_at,lesson_retained,created_at,updated_at')
    .order('updated_at', { ascending: false })
    .limit(bounded)
  if (result.error) return { ok: false as const, error: result.error.message }

  const rows = (result.data ?? []) as FailureAutopsyRow[]
  const byStage: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  for (const row of rows) {
    if (row.primary_stage) byStage[row.primary_stage] = (byStage[row.primary_stage] ?? 0) + 1
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1
  }

  return {
    ok: true as const,
    report: {
      turns: rows.length,
      pendingRetests: rows.filter(row => row.status === 'retest_pending').length,
      awaitingEvidence: rows.filter(row => row.status === 'awaiting_evidence').length,
      passedRetests: rows.filter(row => row.status === 'retest_passed').length,
      failedRetests: rows.filter(row => row.status === 'retest_failed').length,
      retainedLessons: rows.filter(row => row.lesson_retained).length,
      byStage,
      byStatus,
      rows,
      semantics: 'Autopsies contain explicit execution/evidence/outcome artifacts only. A retained lesson means a separate guided shadow retest passed; it is not automatic live-policy promotion.',
    },
  }
}

export async function runNextFailureAutopsyRetest() {
  const db = cosServiceDb()
  if (!db) return { ok: false as const, error: 'COS service database is not configured.' }

  const pending = await db.from('cos_turn_failure_autopsies')
    .select('id,turn_id,problem_class,primary_stage,corrective_guidance,source_case_id,status,created_at')
    .eq('status', 'retest_pending')
    .not('corrective_guidance', 'is', null)
    .order('created_at', { ascending: true })
    .limit(20)
  if (pending.error) return { ok: false as const, error: pending.error.message }

  for (const autopsy of pending.data ?? []) {
    const previous = await db.from('cos_turn_failure_autopsy_retests')
      .select('case_id')
      .eq('autopsy_id', autopsy.id)
      .order('created_at', { ascending: false })
      .limit(20)
    if (previous.error) return { ok: false as const, error: previous.error.message }

    const candidate = selectFailureAutopsyRetestCase({
      problemClass: String(autopsy.problem_class || 'general reasoning'),
      sourceCaseId: autopsy.source_case_id ? String(autopsy.source_case_id) : null,
      attemptedCaseIds: (previous.data ?? []).map(row => String(row.case_id)),
    }, CONTROLLED_RETEST_CANDIDATES)

    if (!candidate) {
      await db.from('cos_turn_failure_autopsies').update({
        status: 'insufficient_evidence',
        updated_at: new Date().toISOString(),
      }).eq('id', autopsy.id).eq('status', 'retest_pending')
      continue
    }

    const test = COS_EVIDENCE_UTILIZATION_BENCHMARK.find(item => item.id === candidate.id)
    if (!test) continue

    const locked = await db.from('cos_turn_failure_autopsies').update({
      status: 'retest_running',
      retest_case_id: test.id,
      updated_at: new Date().toISOString(),
    }).eq('id', autopsy.id).eq('status', 'retest_pending').select('id').maybeSingle()
    if (locked.error) return { ok: false as const, error: locked.error.message }
    if (!locked.data?.id) continue

    try {
      const outcome = await runPrivateCapabilityCase(test, {
        shadowGuidance: String(autopsy.corrective_guidance || ''),
        outcomeSource: `failure_autopsy_retest:${autopsy.id}:${test.id}`,
      })
      const passed = outcome.score.passed === true
      const now = new Date().toISOString()

      const retest = await db.from('cos_turn_failure_autopsy_retests').insert({
        autopsy_id: autopsy.id,
        case_id: test.id,
        case_domain: test.domain,
        mode: 'guided_shadow',
        turn_id: outcome.turnId,
        passed,
        reasons: outcome.score.reasons,
        latency_ms: outcome.latencyMs,
      })
      if (retest.error) throw retest.error

      const update = await db.from('cos_turn_failure_autopsies').update({
        status: passed ? 'retest_passed' : 'retest_failed',
        retest_case_id: test.id,
        retest_turn_id: outcome.turnId,
        retest_passed: passed,
        retest_at: now,
        lesson_retained: retainedLessonAfterRetest(passed),
        updated_at: now,
      }).eq('id', autopsy.id)
      if (update.error) throw update.error

      return {
        ok: true as const,
        autopsyId: String(autopsy.id),
        sourceTurnId: String(autopsy.turn_id),
        primaryStage: autopsy.primary_stage ? String(autopsy.primary_stage) : null,
        problemClass: String(autopsy.problem_class),
        sourceCaseId: autopsy.source_case_id ? String(autopsy.source_case_id) : null,
        retestCaseId: test.id,
        retestDomain: test.domain,
        retestTurnId: outcome.turnId,
        passed,
        lessonRetained: retainedLessonAfterRetest(passed),
        reasons: outcome.score.reasons,
        latencyMs: outcome.latencyMs,
        semantics: 'guided_shadow_retest_no_live_policy_promotion',
      }
    } catch (error) {
      await db.from('cos_turn_failure_autopsies').update({
        status: 'retest_pending',
        retest_case_id: null,
        updated_at: new Date().toISOString(),
      }).eq('id', autopsy.id).eq('status', 'retest_running')
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
    }
  }

  return { ok: false as const, error: 'No pending autopsy has an independent controlled retest case available.' }
}
