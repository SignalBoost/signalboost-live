import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  autopsyPracticeRate,
  autopsyPracticeReady,
  deriveAutopsySkillCandidates,
  type AutopsyPromotionRow,
  type AutopsySkillCandidate,
} from '@/lib/ai/cos/failureAutopsyPromotionPolicy'

function safeTime(value: unknown): number {
  const parsed = Date.parse(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function latestAt(rows: readonly AutopsyPromotionRow[]): string | null {
  const latest = [...rows].sort((a, b) => safeTime(b.updated_at) - safeTime(a.updated_at))[0]
  return latest?.updated_at || null
}

async function writePracticeExperiences(db: any, candidate: AutopsySkillCandidate): Promise<void> {
  const rows = [...candidate.successRows, ...candidate.failureRows]
    .sort((a, b) => safeTime(a.updated_at) - safeTime(b.updated_at))
  for (const row of rows) {
    const caseId = String(row.retest_case_id || '').trim()
    if (!caseId) continue
    const success = row.retest_passed === true && row.lesson_retained === true && row.status === 'retest_passed'
    const experienceHash = createHash('sha256').update(`failure-autopsy-practice:${candidate.skillKey}:${caseId}`).digest('hex')
    const payload = {
      experience_hash: experienceHash,
      subject: candidate.problemClass,
      experience_kind: 'practice',
      skill_key: candidate.skillKey,
      variant_key: caseId,
      source_kind: 'failure_autopsy_controlled_practice',
      source_ref: `cos_turn_failure_autopsies:${row.id}`,
      success,
      score: success ? 1 : 0,
      evidence: {
        schemaVersion: 2,
        primaryStage: candidate.stage,
        autopsyId: row.id,
        retestCaseId: caseId,
        evidenceRole: 'controlled_practice_only',
        heldOut: false,
        semantics: 'guided_controlled_retest_not_private_holdout_no_original_prompt_storage',
      },
      last_observed_at: row.updated_at,
      updated_at: new Date().toISOString(),
    }
    const written = await db.from('cos_cognitive_experiences').upsert(payload, { onConflict: 'experience_hash' })
    if (written.error) throw written.error
  }
}

function procedure(candidate: AutopsySkillCandidate) {
  return {
    schemaVersion: 2,
    problemClass: candidate.problemClass,
    prerequisites: [
      'Apply only when the current problem matches this problem class; this is procedural guidance, not factual evidence.',
      'This skill may enter live retrieval only after separate private capability holdouts validate it.',
    ],
    procedureSteps: [candidate.guidance],
    discriminatingSignals: [`Controlled practice failures were classified at the ${candidate.stage} stage.`],
    tools: [],
    observables: candidate.falsifier ? [candidate.falsifier] : [],
    falsifiers: candidate.falsifier ? [candidate.falsifier] : [],
    commonFailureModes: [`Repeat of the ${candidate.stage} failure pattern despite relevant authorized evidence.`],
    prohibitedActions: [
      'Do not lower source-trust, tenant-scope, authorization, safety, financial, or approval gates to make an answer pass.',
      'Do not use benchmark fixture wording as factual evidence or disclose private held-out prompts.',
      'Do not count controlled evidence-utilization retests as held-out validation.',
    ],
  }
}

export async function reconcileFailureAutopsySkills(): Promise<{
  inspected: number
  prepared: string[]
  weakened: string[]
  pending: Array<{ skillKey: string; practiceAttempts: number; practiceSuccesses: number; practiceRate: number | null; failures: number }>
}> {
  const db = cosServiceDb()
  if (!db) return { inspected: 0, prepared: [], weakened: [], pending: [] }

  const result = await db.from('cos_turn_failure_autopsies')
    .select('id,problem_class,primary_stage,corrective_guidance,falsifier,retest_case_id,retest_passed,lesson_retained,status,updated_at')
    .in('status', ['retest_passed', 'retest_failed'])
    .order('updated_at', { ascending: false })
    .limit(500)
  if (result.error) throw result.error

  const candidates = deriveAutopsySkillCandidates((result.data ?? []) as AutopsyPromotionRow[])
  const prepared: string[] = []
  const weakened: string[] = []
  const pending: Array<{ skillKey: string; practiceAttempts: number; practiceSuccesses: number; practiceRate: number | null; failures: number }> = []

  for (const candidate of candidates) {
    const existing = await db.from('cos_cognitive_skills').select('*').eq('skill_key', candidate.skillKey).maybeSingle()
    if (existing.error) throw existing.error
    const row = existing.data as any | null
    const practiceAttempts = candidate.successRows.length + candidate.failureRows.length
    const practiceSuccesses = candidate.successRows.length
    const practiceRate = autopsyPracticeRate(candidate)
    const latestPracticeAt = latestAt([...candidate.successRows, ...candidate.failureRows]) || new Date().toISOString()
    const latestFailureAt = latestAt(candidate.failureRows)
    const validationAt = safeTime(row?.last_validated_at)
    const newFailureAfterValidation = Boolean(
      row?.id
      && ['validated', 'learned', 'mastered'].includes(String(row.status))
      && latestFailureAt
      && safeTime(latestFailureAt) > validationAt,
    )

    await writePracticeExperiences(db, candidate)

    if (newFailureAfterValidation && row?.id) {
      const now = new Date().toISOString()
      const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
      const update = await db.from('cos_cognitive_skills').update({
        weakened_at: now,
        status: 'weakened',
        failure_count: Math.max(Number(row.failure_count || 0) + 1, candidate.failureRows.length),
        metadata: {
          ...metadata,
          failureAutopsyRollback: {
            at: now,
            latestFailureAt,
            policy: 'failure-autopsy-private-validation-v2',
            reason: 'controlled retest failure occurred after the last independent validation',
          },
        },
        updated_at: now,
      }).eq('id', row.id)
      if (update.error) throw update.error
      weakened.push(candidate.skillKey)
      pending.push({ skillKey: candidate.skillKey, practiceAttempts, practiceSuccesses, practiceRate, failures: candidate.failureRows.length })
      continue
    }

    if (!autopsyPracticeReady(candidate)) {
      if (row?.id && !['validated', 'learned', 'mastered', 'weakened', 'quarantined'].includes(String(row.status))) {
        const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
        const update = await db.from('cos_cognitive_skills').update({
          practice_attempts: Math.max(Number(row.practice_attempts || 0), practiceAttempts),
          practice_successes: Math.max(Number(row.practice_successes || 0), practiceSuccesses),
          last_practiced_at: latestPracticeAt,
          status: 'understood',
          metadata: { ...metadata, private_holdout_required: true, practice_evidence_role: 'controlled_non_holdout' },
          updated_at: new Date().toISOString(),
        }).eq('id', row.id)
        if (update.error) throw update.error
      }
      pending.push({ skillKey: candidate.skillKey, practiceAttempts, practiceSuccesses, practiceRate, failures: candidate.failureRows.length })
      continue
    }

    const provenance = {
      ...(row?.provenance && typeof row.provenance === 'object' ? row.provenance : {}),
      origin: 'failure_autopsy_controlled_practice',
      policy: 'failure-autopsy-private-validation-v2',
      primary_stage: candidate.stage,
      practice_autopsy_ids: candidate.successRows.map(item => item.id),
      practice_retest_case_ids: candidate.successRows.map(item => item.retest_case_id).filter(Boolean),
      practice_evidence_role: 'controlled_non_holdout',
      private_holdout_required: true,
      original_prompt_stored: false,
    }
    const metadata = {
      ...(row?.metadata && typeof row.metadata === 'object' ? row.metadata : {}),
      activation_rule: 'never live until separate private capability holdouts promote this skill to validated',
      confidence_rule: 'skill lifecycle status must not increase answer confidence',
      automatic_repair: true,
      private_holdout_required: true,
      rollback_rule: 'weakened_at is sticky until fresh separately recorded private holdout revalidation clears it',
    }
    const commonPatch: Record<string, unknown> = {
      subject: candidate.problemClass,
      title: `Self-healed ${candidate.stage.replace(/_/g, ' ')} discipline`,
      description: candidate.guidance,
      procedure: procedure(candidate),
      evaluator_approved: true,
      understanding_approved: true,
      encounter_count: Math.max(practiceAttempts, Number(row?.encounter_count || 0)),
      practice_attempts: Math.max(practiceAttempts, Number(row?.practice_attempts || 0)),
      practice_successes: Math.max(practiceSuccesses, Number(row?.practice_successes || 0)),
      last_practiced_at: latestPracticeAt,
      provenance,
      metadata,
      updated_at: new Date().toISOString(),
    }

    if (row?.id) {
      // Stronger lifecycle states are never downgraded by practice reconciliation, and a sticky
      // weakened/quarantined state is never cleared from stale pre-weakening evidence.
      if (!['validated', 'learned', 'mastered', 'weakened', 'quarantined'].includes(String(row.status))) {
        commonPatch.status = 'practiced'
      }
      const update = await db.from('cos_cognitive_skills').update(commonPatch).eq('id', row.id)
      if (update.error) throw update.error
    } else {
      const insert = await db.from('cos_cognitive_skills').insert({
        skill_key: candidate.skillKey,
        status: 'practiced',
        holdout_attempts: 0,
        holdout_successes: 0,
        distinct_holdout_variants: 0,
        failure_count: candidate.failureRows.length,
        ...commonPatch,
      })
      if (insert.error) throw insert.error
    }
    prepared.push(candidate.skillKey)
  }

  return { inspected: candidates.length, prepared, weakened, pending }
}
