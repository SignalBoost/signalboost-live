import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { callCosReasoner } from '@/lib/ai/cos/cosReasoner'
import { parseLocalResult } from '@/lib/ai/cos/reasonerOutput'
import { evaluateAnswerAgainstRubric, type CognitivePracticeRubric } from '@/lib/ai/cos/cognitiveSkillCandidate'
import {
  certificationProfileForSkill,
  reviewCuratedCertificationCandidate,
  type CognitiveCertificationProfileKey,
} from '@/lib/ai/cos/cognitiveCertificationProfiles'
import {
  refreshCognitiveSkillStatus,
  runNextCognitivePracticeForSkill,
} from '@/lib/ai/cos/cognitiveActiveLearning'

const CERTIFIABLE_STATUSES = ['encountered', 'evaluated', 'understood', 'practiced', 'validated'] as const
const PRACTICED_OR_STRONGER = new Set(['practiced', 'validated', 'learned', 'mastered'])

function clean(value: unknown, max = 6000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function positiveInt(value: unknown, fallback: number, max = 10): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, Math.min(max, Math.floor(parsed))) : fallback
}

type CertificationCaseKind = 'understanding' | 'practice' | 'holdout'

type CertificationCase = {
  id: string
  profile_key: CognitiveCertificationProfileKey
  case_key: string
  case_kind: CertificationCaseKind
  prompt: string
  rubric: CognitivePracticeRubric
  metadata?: Record<string, unknown> | null
}

async function auditCertification(args: {
  skillKey: string
  profile: CognitiveCertificationProfileKey
  phase: string
  success?: boolean | null
  score?: number | null
  reason: string
  evidence?: Record<string, unknown>
}): Promise<void> {
  const db = cosServiceDb()
  if (!db) return
  const result = await db.from('cos_cognitive_certification_events').insert({
    skill_key: args.skillKey,
    profile_key: args.profile,
    phase: clean(args.phase, 80),
    success: args.success ?? null,
    score: args.score ?? null,
    reason: clean(args.reason, 1200),
    evidence: args.evidence || {},
  })
  if (result.error) console.warn('[cos-cognitive-certification] audit failed', result.error)
}

async function loadCases(
  profile: CognitiveCertificationProfileKey,
  kind: CertificationCaseKind,
): Promise<CertificationCase[]> {
  const db = cosServiceDb()
  if (!db) return []
  const result = await db.from('cos_cognitive_certification_cases')
    .select('id,profile_key,case_key,case_kind,prompt,rubric,metadata')
    .eq('profile_key', profile)
    .eq('case_kind', kind)
    .eq('active', true)
    .order('case_key', { ascending: true })
    .limit(kind === 'holdout' ? 12 : 4)
  if (result.error) throw result.error
  return (result.data || []) as CertificationCase[]
}

async function nextCertifiableSkill(): Promise<{ row: any; profile: CognitiveCertificationProfileKey } | null> {
  const db = cosServiceDb()
  if (!db) return null
  const result = await db.from('cos_cognitive_skills')
    .select('*')
    .in('status', [...CERTIFIABLE_STATUSES])
    .is('quarantined_at', null)
    .order('updated_at', { ascending: true })
    .limit(16)
  if (result.error) throw result.error
  for (const row of result.data || []) {
    const profile = certificationProfileForSkill(row)
    if (profile) return { row, profile }
  }
  return null
}

async function deterministicCuratedReview(row: any, profile: CognitiveCertificationProfileKey): Promise<boolean> {
  if (row.evaluator_approved) return true
  const db = cosServiceDb()
  if (!db) return false
  const review = reviewCuratedCertificationCandidate(row, profile)
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  const certification = metadata.certification && typeof metadata.certification === 'object' ? metadata.certification : {}
  const now = new Date().toISOString()
  const update = await db.from('cos_cognitive_skills').update({
    evaluator_approved: review.approved,
    failure_count: Number(row.failure_count || 0) + (review.approved ? 0 : 1),
    metadata: {
      ...metadata,
      certification_profile: profile,
      certification: {
        ...certification,
        profile,
        candidate_review: {
          at: now,
          approved: review.approved,
          score: review.score,
          reasons: review.reasons,
          evaluator: 'curated_deterministic_profile_v1',
          independentOfCandidateGenerator: true,
          automaticPromotion: false,
        },
      },
    },
    updated_at: now,
  }).eq('id', row.id)
  if (update.error) throw update.error
  await auditCertification({
    skillKey: row.skill_key,
    profile,
    phase: 'candidate_review',
    success: review.approved,
    score: review.score,
    reason: review.approved ? 'curated_profile_candidate_approved' : `candidate_rejected:${review.reasons.join(',')}`,
    evidence: { reasons: review.reasons, independentOfCandidateGenerator: true, automaticPromotion: false },
  })
  await refreshCognitiveSkillStatus(row.skill_key)
  return review.approved
}

async function runCuratedUnderstanding(row: any, profile: CognitiveCertificationProfileKey): Promise<boolean> {
  if (row.understanding_approved) return true
  const db = cosServiceDb()
  if (!db) return false
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  const certification = metadata.certification && typeof metadata.certification === 'object' ? metadata.certification : {}
  const priorUnderstanding = certification.understanding && typeof certification.understanding === 'object' ? certification.understanding as Record<string, unknown> : {}
  const priorAttempts = Number(priorUnderstanding.attempts || 0)
  if (priorAttempts >= 2 && priorUnderstanding.passed !== true) {
    await auditCertification({
      skillKey: row.skill_key,
      profile,
      phase: 'understanding',
      success: false,
      score: Number(priorUnderstanding.score || 0),
      reason: 'understanding_retry_limit_reached',
    })
    return false
  }

  const cases = await loadCases(profile, 'understanding')
  const testCase = cases[0]
  if (!testCase) {
    await auditCertification({ skillKey: row.skill_key, profile, phase: 'understanding', reason: 'private_understanding_case_missing' })
    return false
  }

  const reasoned = await callCosReasoner({
    temperature: 0,
    maxTokens: 2200,
    systemPrompt: 'Apply the supplied procedural skill to an independent hidden understanding case. Return strict JSON only: {"answer":"...","confidence":0..1}. Never claim the skill itself is factual evidence.',
    prompt: `PROCEDURAL SKILL:\n${clean(JSON.stringify(row.procedure), 15000)}\n\nINDEPENDENT UNDERSTANDING CASE:\n${clean(testCase.prompt, 12000)}\n\nSolve the case. You cannot see the grading rubric.`,
  }).catch(() => null)
  const parsed = reasoned?.text ? parseLocalResult(reasoned.text) : null
  const grade = evaluateAnswerAgainstRubric(parsed?.answer || '', testCase.rubric || {})
  const passed = Boolean(parsed) && grade.pass
  const now = new Date().toISOString()
  const latest = await db.from('cos_cognitive_skills').select('metadata,failure_count').eq('id', row.id).single()
  if (latest.error) throw latest.error
  const latestMetadata = latest.data?.metadata && typeof latest.data.metadata === 'object' ? latest.data.metadata : {}
  const latestCertification = latestMetadata.certification && typeof latestMetadata.certification === 'object' ? latestMetadata.certification : {}
  const update = await db.from('cos_cognitive_skills').update({
    understanding_approved: passed,
    failure_count: Number(latest.data?.failure_count || 0) + (passed ? 0 : 1),
    metadata: {
      ...latestMetadata,
      certification_profile: profile,
      certification: {
        ...latestCertification,
        profile,
        understanding: {
          at: now,
          attempts: priorAttempts + 1,
          passed,
          score: grade.score,
          coverage: grade.coverage,
          caseKey: testCase.case_key,
          source: 'private_curated_case',
          localReasoner: reasoned?.reasoner.label || null,
        },
      },
    },
    updated_at: now,
  }).eq('id', row.id)
  if (update.error) throw update.error
  await auditCertification({
    skillKey: row.skill_key,
    profile,
    phase: 'understanding',
    success: passed,
    score: grade.score,
    reason: grade.reason,
    evidence: { coverage: grade.coverage, caseKey: testCase.case_key, source: 'private_curated_case' },
  })
  await refreshCognitiveSkillStatus(row.skill_key)
  return passed
}

async function queueCertificationCases(
  skillKey: string,
  profile: CognitiveCertificationProfileKey,
  kind: 'practice' | 'holdout',
): Promise<number> {
  const db = cosServiceDb()
  if (!db) return 0
  const cases = await loadCases(profile, kind)
  let queued = 0
  for (const testCase of cases) {
    const result = await db.from('cos_active_practice_queue').upsert({
      skill_key: skillKey,
      teacher_lesson_id: null,
      variant_key: `cert:${profile}:${testCase.case_key}`,
      exercise_kind: kind,
      prompt: clean(testCase.prompt, 12000),
      rubric: testCase.rubric || {},
      generation_source: 'curated',
      evaluator_mode: 'deterministic_rubric',
      max_attempts: kind === 'holdout' ? 1 : 2,
      status: 'queued',
      metadata: {
        origin: 'autonomous_cognitive_certification',
        certificationProfile: profile,
        certificationCaseId: testCase.id,
        privateCase: true,
        independentOfCandidateGenerator: true,
      },
      next_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'skill_key,exercise_kind,variant_key', ignoreDuplicates: true })
    if (!result.error) queued += 1
  }
  return queued
}

async function freshSkill(skillKey: string): Promise<any | null> {
  const db = cosServiceDb()
  if (!db) return null
  const result = await db.from('cos_cognitive_skills').select('*').eq('skill_key', skillKey).maybeSingle()
  if (result.error) throw result.error
  return result.data || null
}

export type CognitiveCertificationSummary = {
  enabled: boolean
  candidate: string | null
  profile: CognitiveCertificationProfileKey | null
  reviewed: boolean
  understandingPassed: boolean | null
  practiceQueued: number
  practiceRuns: Array<Record<string, unknown>>
  holdoutsQueued: number
  holdoutRuns: Array<Record<string, unknown>>
  finalStatus: string | null
  blockedReason: string | null
  errors: string[]
}

/**
 * Autonomous certification is deliberately narrower than autonomous reflection. COS may create many
 * candidates, but it may self-schedule independent certification only when SignalBoost owns a private
 * curated profile for that skill family. Unsupported candidates remain encountered until a separate
 * independent evaluator or curated profile exists. No closed-model evaluator is enabled here.
 */
export async function runCognitiveCertificationCycle(): Promise<CognitiveCertificationSummary> {
  if (process.env.COS_COGNITIVE_CERTIFICATION_ENABLED === 'false') {
    return {
      enabled: false, candidate: null, profile: null, reviewed: false, understandingPassed: null,
      practiceQueued: 0, practiceRuns: [], holdoutsQueued: 0, holdoutRuns: [], finalStatus: null,
      blockedReason: 'disabled', errors: [],
    }
  }
  const summary: CognitiveCertificationSummary = {
    enabled: true,
    candidate: null,
    profile: null,
    reviewed: false,
    understandingPassed: null,
    practiceQueued: 0,
    practiceRuns: [],
    holdoutsQueued: 0,
    holdoutRuns: [],
    finalStatus: null,
    blockedReason: null,
    errors: [],
  }

  const target = await nextCertifiableSkill()
  if (!target) {
    summary.blockedReason = 'no_candidate_with_supported_private_certification_profile'
    return summary
  }
  summary.candidate = String(target.row.skill_key)
  summary.profile = target.profile

  try {
    summary.reviewed = await deterministicCuratedReview(target.row, target.profile)
    if (!summary.reviewed) {
      summary.blockedReason = 'candidate_failed_curated_profile_review'
      summary.finalStatus = String((await freshSkill(target.row.skill_key))?.status || target.row.status)
      return summary
    }

    let skill = await freshSkill(target.row.skill_key)
    if (!skill) throw new Error('certification_skill_missing_after_review')
    summary.understandingPassed = await runCuratedUnderstanding(skill, target.profile)
    if (!summary.understandingPassed) {
      summary.blockedReason = 'independent_understanding_not_passed'
      summary.finalStatus = String((await freshSkill(target.row.skill_key))?.status || skill.status)
      return summary
    }

    skill = await freshSkill(target.row.skill_key)
    if (!skill) throw new Error('certification_skill_missing_after_understanding')

    summary.practiceQueued = await queueCertificationCases(skill.skill_key, target.profile, 'practice')
    const practiceLimit = positiveInt(process.env.COS_COGNITIVE_CERTIFICATION_PRACTICE_PER_CYCLE, 2, 4)
    for (let i = 0; i < practiceLimit; i += 1) {
      const result = await runNextCognitivePracticeForSkill(skill.skill_key, 'practice')
      if (!result) break
      summary.practiceRuns.push(result)
    }

    let lifecycle = await refreshCognitiveSkillStatus(skill.skill_key)
    skill = await freshSkill(skill.skill_key)
    if (!skill) throw new Error('certification_skill_missing_after_practice')
    if (!PRACTICED_OR_STRONGER.has(String(lifecycle?.status || skill.status))) {
      summary.blockedReason = 'practice_evidence_not_sufficient'
      summary.finalStatus = String(lifecycle?.status || skill.status)
      return summary
    }

    summary.holdoutsQueued = await queueCertificationCases(skill.skill_key, target.profile, 'holdout')
    const holdoutLimit = positiveInt(process.env.COS_COGNITIVE_CERTIFICATION_HOLDOUTS_PER_CYCLE, 3, 6)
    for (let i = 0; i < holdoutLimit; i += 1) {
      const result = await runNextCognitivePracticeForSkill(skill.skill_key, 'holdout')
      if (!result) break
      summary.holdoutRuns.push(result)
    }

    lifecycle = await refreshCognitiveSkillStatus(skill.skill_key)
    summary.finalStatus = String(lifecycle?.status || (await freshSkill(skill.skill_key))?.status || skill.status)
    await auditCertification({
      skillKey: skill.skill_key,
      profile: target.profile,
      phase: 'cycle_complete',
      success: ['validated', 'learned', 'mastered'].includes(summary.finalStatus),
      reason: `cycle_complete:${summary.finalStatus}`,
      evidence: {
        practiceRuns: summary.practiceRuns.length,
        holdoutRuns: summary.holdoutRuns.length,
        automaticClosedModelEvaluation: false,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    summary.errors.push(message)
    summary.blockedReason = 'certification_cycle_error'
    await auditCertification({
      skillKey: summary.candidate || 'unknown',
      profile: summary.profile || 'context_ambiguity_v1',
      phase: 'cycle_error',
      success: false,
      reason: message,
    }).catch(() => undefined)
  }
  return summary
}
