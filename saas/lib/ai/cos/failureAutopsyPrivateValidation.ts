import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { classifyProblemClass } from '@/lib/ai/cos/cosProblemClass'
import { isPrivateCapabilityAcceptanceOrigin } from '@/lib/ai/cos/capabilityBenchmarkCohort'
import { runPrivateCapabilityCase } from '@/lib/ai/cos/capabilityBenchmarkRunner'
import { refreshCognitiveSkillStatus } from '@/lib/ai/cos/cognitiveActiveLearning'
import {
  selectUnusedPrivateHoldoutCase,
  summarizePrivateHoldoutEvidence,
  type FailureAutopsyPrivateValidationEvidence,
} from '@/lib/ai/cos/failureAutopsyPrivateValidationPolicy'

function terms(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => String(item)).filter(Boolean) : []
}

function isFailureAutopsySkill(row: any): boolean {
  return String(row?.provenance?.origin || '') === 'failure_autopsy_controlled_practice'
}

function guidanceForSkill(row: any): string {
  const steps = Array.isArray(row?.procedure?.procedureSteps) ? row.procedure.procedureSteps : []
  return String(steps[0] || row?.description || '').replace(/\s+/g, ' ').trim().slice(0, 2400)
}

async function privateCases(db: any) {
  const result = await db.from('cos_capability_benchmark_cases')
    .select('id,track,prompt,required_terms,forbidden_terms,requires_local_reasoning,origin,created_at')
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(200)
  if (result.error) throw result.error
  return (result.data ?? [])
    .filter((row: any) => isPrivateCapabilityAcceptanceOrigin(row.origin))
    .map((row: any) => ({ ...row, problemClass: classifyProblemClass(String(row.prompt || '')) }))
}

async function validationEvidence(db: any, skillKey: string): Promise<FailureAutopsyPrivateValidationEvidence[]> {
  const result = await db.from('cos_cognitive_experiences')
    .select('variant_key,success,last_observed_at,created_at')
    .eq('skill_key', skillKey)
    .eq('source_kind', 'failure_autopsy_private_holdout')
    .order('last_observed_at', { ascending: true })
    .limit(200)
  if (result.error) throw result.error
  return (result.data ?? []).map((row: any) => ({
    caseId: String(row.variant_key || ''),
    success: row.success === true,
    observedAt: String(row.last_observed_at || row.created_at || ''),
  })).filter((row: FailureAutopsyPrivateValidationEvidence) => row.caseId && row.observedAt)
}

async function candidateSkills(db: any) {
  const result = await db.from('cos_cognitive_skills')
    .select('*')
    .in('status', ['practiced', 'weakened'])
    .order('updated_at', { ascending: true })
    .limit(100)
  if (result.error) throw result.error
  return (result.data ?? []).filter(isFailureAutopsySkill)
}

export async function countPendingFailureAutopsyPrivateValidations(): Promise<number> {
  const db = cosServiceDb()
  if (!db) return 0
  const [skills, cases] = await Promise.all([candidateSkills(db), privateCases(db)])
  let pending = 0
  for (const skill of skills) {
    const evidence = await validationEvidence(db, String(skill.skill_key))
    const selected = selectUnusedPrivateHoldoutCase({
      cases,
      problemClass: String(skill.subject || skill.procedure?.problemClass || ''),
      priorCaseIds: evidence.map(row => row.caseId),
    })
    if (selected) pending += 1
  }
  return pending
}

export async function runNextFailureAutopsyPrivateValidation(): Promise<{
  ok: boolean
  skillKey?: string
  caseId?: string
  passed?: boolean
  statusBefore?: string
  statusAfter?: string | null
  freshRevalidated?: boolean
  error?: string
}> {
  const db = cosServiceDb()
  if (!db) return { ok: false, error: 'COS service database is not configured.' }
  const [skills, cases] = await Promise.all([candidateSkills(db), privateCases(db)])

  for (const skill of skills) {
    const skillKey = String(skill.skill_key || '')
    const problemClass = String(skill.subject || skill.procedure?.problemClass || '')
    const guidance = guidanceForSkill(skill)
    if (!skillKey || !problemClass || !guidance) continue

    const priorEvidence = await validationEvidence(db, skillKey)
    const selected = selectUnusedPrivateHoldoutCase({
      cases,
      problemClass,
      priorCaseIds: priorEvidence.map(row => row.caseId),
    }) as any | null
    if (!selected) continue

    const outcome = await runPrivateCapabilityCase({
      id: String(selected.id),
      track: String(selected.track),
      prompt: String(selected.prompt),
      requiredTerms: terms(selected.required_terms),
      forbiddenTerms: terms(selected.forbidden_terms),
      requiresProvenance: true,
      requiresLocalReasoning: Boolean(selected.requires_local_reasoning),
    }, {
      shadowGuidance: guidance,
      outcomeSource: `failure_autopsy_private_holdout:${skillKey}:${String(selected.id)}`,
      // This validation is already recorded below as cognitive holdout evidence. Do not recursively
      // create another failure-autopsy row from the validation turn itself.
      attachOutcome: false,
    })

    const observedAt = new Date().toISOString()
    const passed = outcome.score.passed === true
    const experienceHash = createHash('sha256').update(`failure-autopsy-private-holdout:${skillKey}:${String(selected.id)}`).digest('hex')
    const written = await db.from('cos_cognitive_experiences').upsert({
      experience_hash: experienceHash,
      subject: problemClass,
      experience_kind: 'holdout',
      skill_key: skillKey,
      variant_key: String(selected.id),
      source_kind: 'failure_autopsy_private_holdout',
      source_ref: `cos_capability_benchmark_cases:${String(selected.id)}`,
      success: passed,
      score: passed ? 1 : 0,
      evidence: {
        schemaVersion: 1,
        privateCapabilityAcceptance: true,
        caseId: String(selected.id),
        guidanceAssistedShadow: true,
        originalPromptStored: false,
        semantics: 'private_acceptance_case_independent_from_controlled_autopsy_practice',
      },
      last_observed_at: observedAt,
      updated_at: observedAt,
    }, { onConflict: 'experience_hash' })
    if (written.error) throw written.error

    const allEvidence = [...priorEvidence, { caseId: String(selected.id), success: passed, observedAt }]
    const total = summarizePrivateHoldoutEvidence(allEvidence)
    const fresh = skill.weakened_at ? summarizePrivateHoldoutEvidence(allEvidence, String(skill.weakened_at)) : total
    const patch: Record<string, unknown> = {
      holdout_attempts: Math.max(Number(skill.holdout_attempts || 0), total.attempts),
      holdout_successes: Math.max(Number(skill.holdout_successes || 0), total.successes),
      distinct_holdout_variants: Math.max(Number(skill.distinct_holdout_variants || 0), total.distinctCases),
      failure_count: Math.max(Number(skill.failure_count || 0), total.failures),
      updated_at: observedAt,
      metadata: {
        ...(skill.metadata && typeof skill.metadata === 'object' ? skill.metadata : {}),
        privateHoldoutValidation: {
          attempts: total.attempts,
          successes: total.successes,
          failures: total.failures,
          successRate: total.successRate,
          latestCaseId: String(selected.id),
          latestPassed: passed,
          updatedAt: observedAt,
        },
      },
    }

    let freshRevalidated = false
    if (skill.weakened_at) {
      // Sticky weakened state is cleared ONLY from separately recorded private validation evidence
      // newer than weakened_at. Old controlled practice and old private passes cannot reactivate it.
      if (fresh.eligible && fresh.latestSuccessAt) {
        patch.weakened_at = null
        patch.last_validated_at = fresh.latestSuccessAt
        freshRevalidated = true
      }
    } else if (total.eligible && total.latestSuccessAt) {
      patch.last_validated_at = total.latestSuccessAt
    }

    const updated = await db.from('cos_cognitive_skills').update(patch).eq('id', skill.id)
    if (updated.error) throw updated.error
    const lifecycle = await refreshCognitiveSkillStatus(skillKey)

    return {
      ok: true,
      skillKey,
      caseId: String(selected.id),
      passed,
      statusBefore: String(skill.status),
      statusAfter: lifecycle?.status ?? null,
      freshRevalidated,
    }
  }

  return { ok: false, error: 'No practiced or weakened failure-autopsy skill has an unused matching private capability holdout case.' }
}
