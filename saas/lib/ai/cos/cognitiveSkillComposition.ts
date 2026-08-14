import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { callCosReasoner } from '@/lib/ai/cos/cosReasoner'
import { parseLocalResult } from '@/lib/ai/cos/reasonerOutput'
import { retrieveValidatedCognitiveSkills } from '@/lib/ai/cos/cognitiveSkillContext'
import { evaluateAnswerAgainstRubric, type CognitivePracticeVariant } from '@/lib/ai/cos/cognitiveSkillCandidate'
import { createExternalTeacherAiPort, type ExternalTeacherProvider } from '@/lib/cos/aiPort'
import {
  buildCompositionDraftPrompt,
  buildCompositionEvaluatorPrompt,
  buildLocalCompositionPracticePrompt,
  cognitiveCompositionProcedure,
  compositionKeyForDraft,
  parseCognitiveCompositionDraft,
  parseCompositionEvaluation,
  parseCompositionPracticeVariants,
  validateCognitiveCompositionDraft,
  type CognitiveCompositionDraft,
} from '@/lib/ai/cos/cognitiveCompositionCandidate'
import {
  assessCognitiveCompositionOpportunity,
  evaluateCognitiveCompositionEligibility,
  type CognitiveCompositionEvidence,
  type CognitiveCompositionStatus,
} from '@/lib/ai/cos/cognitiveCompositionPolicy'

const STRONG_SKILL_STATUSES = new Set(['validated', 'learned', 'mastered'])
const STRONG_COMPOSITION_STATUSES = new Set<CognitiveCompositionStatus>(['validated', 'learned'])

function clean(value: unknown, max = 6000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function positiveInt(value: unknown, fallback: number, max = 8): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, Math.min(max, Math.floor(parsed))) : fallback
}

function externalEvaluationEnabled(): boolean {
  const specific = process.env.COS_COGNITIVE_COMPOSITION_EXTERNAL_EVALUATION_ENABLED
  if (specific === 'true' || specific === 'false') return specific === 'true'
  return process.env.COS_COGNITIVE_EXTERNAL_EVALUATION_ENABLED === 'true'
}

function configuredEvaluatorProvider(): ExternalTeacherProvider {
  const configured = process.env.COS_COGNITIVE_EVALUATOR_PROVIDER?.trim().toLowerCase()
  if (configured === 'openai' || configured === 'claude' || configured === 'gemini') return configured
  return 'gemini'
}

function compositionEvidence(row: any): CognitiveCompositionEvidence {
  return {
    evaluatorApproved: Boolean(row.evaluator_approved),
    practiceAttempts: Number(row.practice_attempts || 0),
    practiceSuccesses: Number(row.practice_successes || 0),
    transferAttempts: Number(row.transfer_attempts || 0),
    transferSuccesses: Number(row.transfer_successes || 0),
    distinctTransferVariants: Number(row.distinct_transfer_variants || 0),
    compositeScoreTotal: Number(row.composite_score_total || 0),
    bestMemberScoreTotal: Number(row.best_member_score_total || 0),
    compositeWinCount: Number(row.composite_win_count || 0),
    failureCount: Number(row.failure_count || 0),
    lastValidatedAt: row.last_validated_at || null,
    weakened: Boolean(row.weakened_at),
    quarantined: Boolean(row.quarantined_at),
  }
}

function draftFromRow(row: any): CognitiveCompositionDraft {
  const plan = row?.plan && typeof row.plan === 'object' ? row.plan : {}
  return {
    title: clean(row?.title, 180),
    description: clean(row?.description, 1800),
    problemClass: clean(row?.problem_class || plan.problemClass, 420),
    memberSkillKeys: Array.isArray(row?.member_skill_keys) ? row.member_skill_keys.map((item: unknown) => clean(item, 240)).filter(Boolean) : [],
    sequence: Array.isArray(plan.sequence) ? plan.sequence : [],
    integrationRules: Array.isArray(plan.integrationRules) ? plan.integrationRules : [],
    observables: Array.isArray(plan.observables) ? plan.observables : [],
    falsifiers: Array.isArray(plan.falsifiers) ? plan.falsifiers : [],
    prohibitedActions: Array.isArray(plan.prohibitedActions) ? plan.prohibitedActions : [],
  }
}

async function loadStrongMemberRows(memberSkillKeys: string[]): Promise<any[]> {
  const db = cosServiceDb()
  if (!db || memberSkillKeys.length < 2) return []
  const result = await db.from('cos_cognitive_skills')
    .select('id,skill_key,subject,title,description,procedure,status,provenance,last_validated_at')
    .in('skill_key', memberSkillKeys)
    .in('status', ['validated', 'learned', 'mastered'])
  if (result.error) throw result.error
  const byKey = new Map((result.data ?? []).map((row: any) => [String(row.skill_key), row]))
  return memberSkillKeys.map(key => byKey.get(key)).filter(Boolean)
}

async function flattenedLeafDependencies(memberRows: any[]): Promise<string[]> {
  const leaves = new Set<string>()
  for (const row of memberRows) {
    const provenance = row?.provenance && typeof row.provenance === 'object' ? row.provenance : {}
    const nested = Array.isArray(provenance.leaf_member_skill_keys) ? provenance.leaf_member_skill_keys : []
    if (nested.length) {
      for (const key of nested) if (clean(key, 240)) leaves.add(clean(key, 240))
    } else if (clean(row.skill_key, 240)) {
      leaves.add(clean(row.skill_key, 240))
    }
  }
  return [...leaves].sort()
}

async function promoteCompositionToCognitiveSkill(compositionRow: any): Promise<string | null> {
  if (!STRONG_COMPOSITION_STATUSES.has(String(compositionRow.status) as CognitiveCompositionStatus)) return null
  const db = cosServiceDb()
  if (!db) return null
  const memberKeys = Array.isArray(compositionRow.member_skill_keys) ? compositionRow.member_skill_keys.map(String) : []
  const memberRows = await loadStrongMemberRows(memberKeys)
  if (memberRows.length !== memberKeys.length) return null
  const leafDependencies = await flattenedLeafDependencies(memberRows)
  if (leafDependencies.length < 2) return null

  const skillKey = clean(compositionRow.composition_key, 240)
  const existing = await db.from('cos_cognitive_skills').select('*').eq('skill_key', skillKey).maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data?.quarantined_at) return skillKey

  const status = String(compositionRow.status) === 'learned' ? 'learned' : 'validated'
  const provenance = {
    ...(existing.data?.provenance && typeof existing.data.provenance === 'object' ? existing.data.provenance : {}),
    origin: 'skill_composition',
    composition_id: compositionRow.id,
    composition_key: compositionRow.composition_key,
    source_gap_id: compositionRow.source_gap_id || null,
    member_skill_keys: memberKeys,
    leaf_member_skill_keys: leafDependencies,
  }
  const metadata = {
    ...(existing.data?.metadata && typeof existing.data.metadata === 'object' ? existing.data.metadata : {}),
    composition: true,
    evidence_rule: 'validated only after independent transfer advantage over strongest single member',
    factual_grounding_rule: 'procedural guidance only; never factual corroboration',
    dependency_rule: 'live retrieval requires all leaf member skills to remain validated/learned/mastered',
  }
  const payload = {
    subject: clean(compositionRow.problem_class, 500),
    title: clean(compositionRow.title, 240),
    description: clean(compositionRow.description, 1800),
    procedure: compositionRow.plan,
    status,
    evaluator_approved: true,
    understanding_approved: true,
    encounter_count: Math.max(1, Number(existing.data?.encounter_count || 0)),
    practice_attempts: Number(compositionRow.practice_attempts || 0),
    practice_successes: Number(compositionRow.practice_successes || 0),
    holdout_attempts: Number(compositionRow.transfer_attempts || 0),
    holdout_successes: Number(compositionRow.transfer_successes || 0),
    distinct_holdout_variants: Number(compositionRow.distinct_transfer_variants || 0),
    failure_count: Number(compositionRow.failure_count || 0),
    last_validated_at: compositionRow.last_validated_at || null,
    weakened_at: null,
    provenance,
    metadata,
    updated_at: new Date().toISOString(),
  }

  if (existing.data?.id) {
    const update = await db.from('cos_cognitive_skills').update(payload).eq('id', existing.data.id)
    if (update.error) throw update.error
  } else {
    const insert = await db.from('cos_cognitive_skills').insert({ skill_key: skillKey, ...payload })
    if (insert.error) throw insert.error
  }
  const compositionUpdate = await db.from('cos_cognitive_skill_compositions').update({
    promoted_skill_key: skillKey,
    updated_at: new Date().toISOString(),
  }).eq('id', compositionRow.id)
  if (compositionUpdate.error) throw compositionUpdate.error
  return skillKey
}

export async function refreshCognitiveCompositionStatus(compositionKey: string): Promise<{
  status: CognitiveCompositionStatus
  changed: boolean
  promotedSkillKey: string | null
  eligibility: ReturnType<typeof evaluateCognitiveCompositionEligibility>
} | null> {
  const db = cosServiceDb()
  if (!db) return null
  const result = await db.from('cos_cognitive_skill_compositions').select('*').eq('composition_key', compositionKey).maybeSingle()
  if (result.error || !result.data) return null
  const row = result.data as any
  const eligibility = evaluateCognitiveCompositionEligibility(compositionEvidence(row))
  const nextStatus = eligibility.recommendedStatus
  const changed = String(row.status) !== nextStatus
  let current = row

  if (changed) {
    const promotion = await db.from('cos_cognitive_composition_promotions').insert({
      composition_key: row.composition_key,
      from_status: row.status,
      to_status: nextStatus,
      evidence: { ...compositionEvidence(row), eligibility },
      policy_version: 'composition-transfer-v1',
      reason: eligibility.reasons.join(' '),
    })
    if (promotion.error) throw promotion.error
    const update = await db.from('cos_cognitive_skill_compositions').update({
      status: nextStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', row.id).select('*').single()
    if (update.error) throw update.error
    current = update.data
  }

  const promotedSkillKey = STRONG_COMPOSITION_STATUSES.has(nextStatus)
    ? await promoteCompositionToCognitiveSkill(current)
    : null
  return { status: nextStatus, changed, promotedSkillKey, eligibility }
}

async function enqueueCompositionVariant(args: {
  compositionKey: string
  kind: 'practice' | 'transfer'
  variant: CognitivePracticeVariant
  generationSource: 'local_generator' | 'frontier_teacher' | 'curated' | 'production_replay'
}): Promise<boolean> {
  const db = cosServiceDb()
  if (!db) return false
  if (args.kind === 'transfer' && args.generationSource === 'local_generator') {
    throw new Error('Local-generated composition cases cannot count as independent transfer validation.')
  }
  const result = await db.from('cos_cognitive_composition_trials').upsert({
    composition_key: args.compositionKey,
    variant_key: clean(args.variant.variantKey, 160),
    exercise_kind: args.kind,
    prompt: clean(args.variant.prompt, 12000),
    rubric: args.variant.rubric,
    generation_source: args.generationSource,
    status: 'queued',
    max_attempts: args.kind === 'transfer' ? 1 : 2,
    next_attempt_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'composition_key,exercise_kind,variant_key', ignoreDuplicates: true })
  if (result.error) throw result.error
  return true
}

async function generateLocalCompositionPractice(sourceProblem: string, draft: CognitiveCompositionDraft, compositionKey: string): Promise<number> {
  const reasoned = await callCosReasoner({
    temperature: 0.35,
    maxTokens: 2400,
    systemPrompt: 'Generate multi-skill practice exercises. Return strict JSON only and never include exercise answers.',
    prompt: buildLocalCompositionPracticePrompt({ sourceProblem, draft }),
  })
  if (!reasoned?.text) return 0
  const variants = parseCompositionPracticeVariants(reasoned.text).slice(0, 2)
  let queued = 0
  for (const variant of variants) {
    if (await enqueueCompositionVariant({ compositionKey, kind: 'practice', variant, generationSource: 'local_generator' })) queued += 1
  }
  return queued
}

async function independentlyEvaluateComposition(
  sourceProblem: string,
  compositionRow: any,
): Promise<{ evaluated: boolean; approved: boolean; transferQueued: number; provider?: string; reason?: string }> {
  if (!externalEvaluationEnabled()) return { evaluated: false, approved: false, transferQueued: 0 }
  const metadata = compositionRow.metadata && typeof compositionRow.metadata === 'object' ? compositionRow.metadata : {}
  if (metadata.evaluator_review?.evaluationComplete && !compositionRow.evaluator_approved) {
    return { evaluated: true, approved: false, transferQueued: 0, reason: 'prior_evaluator_rejection' }
  }
  const draft = draftFromRow(compositionRow)
  const memberRows = await loadStrongMemberRows(draft.memberSkillKeys)
  if (memberRows.length !== draft.memberSkillKeys.length) {
    return { evaluated: false, approved: false, transferQueued: 0, reason: 'member_skill_not_strong' }
  }

  const provider = configuredEvaluatorProvider()
  const port = createExternalTeacherAiPort(provider)
  let raw: string
  try {
    raw = await port.generate({
      maxTokens: 3800,
      systemPrompt: 'You are a skeptical transfer evaluator. Return strict JSON only. Individual member validation does not prove composition.',
      prompt: buildCompositionEvaluatorPrompt({
        sourceProblem,
        draft,
        memberProcedures: memberRows.map(row => ({ skillKey: row.skill_key, procedure: row.procedure })),
      }),
    })
  } catch (error) {
    return { evaluated: false, approved: false, transferQueued: 0, provider, reason: error instanceof Error ? error.message : String(error) }
  }
  const evaluation = parseCompositionEvaluation(raw)
  if (!evaluation) return { evaluated: false, approved: false, transferQueued: 0, provider, reason: 'evaluator_parse_failed' }
  const approved = evaluation.candidateApproved && evaluation.candidateScore >= 0.8
  const db = cosServiceDb()
  if (!db) return { evaluated: false, approved: false, transferQueued: 0, provider }
  const update = await db.from('cos_cognitive_skill_compositions').update({
    evaluator_approved: approved,
    metadata: {
      ...metadata,
      evaluator_review: {
        evaluationComplete: true,
        at: new Date().toISOString(),
        requestedProvider: provider,
        candidateScore: evaluation.candidateScore,
        candidateApproved: evaluation.candidateApproved,
        reason: evaluation.reason,
      },
    },
    failure_count: Number(compositionRow.failure_count || 0) + (approved ? 0 : 1),
    updated_at: new Date().toISOString(),
  }).eq('id', compositionRow.id)
  if (update.error) throw update.error

  let transferQueued = 0
  if (approved) {
    for (const variant of evaluation.transfers) {
      if (await enqueueCompositionVariant({
        compositionKey: compositionRow.composition_key,
        kind: 'transfer',
        variant,
        generationSource: 'frontier_teacher',
      })) transferQueued += 1
    }
  }
  await refreshCognitiveCompositionStatus(compositionRow.composition_key)
  return { evaluated: true, approved, transferQueued, provider, reason: evaluation.reason }
}

async function existingCompositionForGap(gapId: string): Promise<any | null> {
  const db = cosServiceDb()
  if (!db) return null
  const result = await db.from('cos_cognitive_skill_compositions').select('*').eq('source_gap_id', gapId).maybeSingle()
  if (result.error) throw result.error
  return result.data ?? null
}

async function persistCompositionDraft(gap: any, draft: CognitiveCompositionDraft, reasonerLabel: string): Promise<any> {
  const db = cosServiceDb()
  if (!db) throw new Error('cos_database_unavailable')
  const compositionKey = compositionKeyForDraft(draft)
  const inserted = await db.from('cos_cognitive_skill_compositions').insert({
    composition_key: compositionKey,
    source_gap_id: gap.id,
    title: draft.title,
    description: draft.description,
    problem_class: draft.problemClass,
    member_skill_keys: [...new Set(draft.memberSkillKeys)].sort(),
    plan: cognitiveCompositionProcedure(draft),
    status: 'candidate',
    evaluator_approved: false,
    provenance: {
      origin: 'learning_gap_transfer',
      source_gap_id: gap.id,
      source_gap_subject: gap.subject,
      local_composer: reasonerLabel,
    },
    metadata: {
      confidence_rule: 'composition lifecycle never increases answer confidence by itself',
      factual_grounding_rule: 'procedural guidance only',
      transfer_rule: 'independent transfer must beat strongest single-member baseline',
    },
    updated_at: new Date().toISOString(),
  }).select('*').single()
  if (inserted.error) throw inserted.error
  return inserted.data
}

async function strongSkillCount(): Promise<number> {
  const db = cosServiceDb()
  if (!db) return 0
  const result = await db.from('cos_cognitive_skills').select('id', { count: 'exact', head: true }).in('status', ['validated', 'learned', 'mastered'])
  if (result.error) return 0
  return Number(result.count || 0)
}

export async function createOrAdvanceCognitiveComposition(): Promise<Record<string, unknown> | null> {
  const db = cosServiceDb()
  if (!db) return null
  const count = await strongSkillCount()
  if (count < 2) return { outcome: 'insufficient_skill_diversity', strongSkillCount: count }

  const gaps = await db.from('cos_learning_gaps')
    .select('id,subject,question,capability,confidence,escalation_reason,repeated_count,status,last_seen_at')
    .in('status', ['pending', 'failed'])
    .order('repeated_count', { ascending: false })
    .order('last_seen_at', { ascending: false })
    .limit(6)
  if (gaps.error) throw gaps.error
  let waiting: Record<string, unknown> | null = null

  for (const gap of gaps.data ?? []) {
    const existing = await existingCompositionForGap(String(gap.id))
    if (existing) {
      const lifecycle = await refreshCognitiveCompositionStatus(existing.composition_key)
      if (STRONG_COMPOSITION_STATUSES.has(lifecycle?.status as CognitiveCompositionStatus)) {
        continue
      }
      if (!existing.evaluator_approved && externalEvaluationEnabled()) {
        const metadata = existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}
        if (!metadata.evaluator_review?.evaluationComplete) {
          const evaluation = await independentlyEvaluateComposition(String(gap.question), existing)
          return { outcome: 'existing_candidate_evaluated', gapId: gap.id, compositionKey: existing.composition_key, evaluation }
        }
      }
      waiting ??= { outcome: 'existing_candidate_waiting', gapId: gap.id, compositionKey: existing.composition_key, status: lifecycle?.status || existing.status, evaluatorApproved: Boolean(existing.evaluator_approved) }
      continue
    }

    const skills = await retrieveValidatedCognitiveSkills(String(gap.question))
    const opportunity = assessCognitiveCompositionOpportunity(skills.items.map(item => item.similarity))
    if (!opportunity.eligible) continue
    const available = skills.items.slice(0, 4)
    const composed = await callCosReasoner({
      temperature: 0.1,
      maxTokens: 3200,
      systemPrompt: 'Compose already validated procedural skills for transfer. Return strict JSON only. Do not answer the source problem.',
      prompt: buildCompositionDraftPrompt({
        problem: String(gap.question),
        skills: available.map(item => ({ skillKey: item.skillKey, line: item.line, status: item.status, similarity: item.similarity })),
      }),
    })
    if (!composed?.text) return { outcome: 'composition_reasoner_unavailable', gapId: gap.id, opportunity }
    const draft = parseCognitiveCompositionDraft(composed.text)
    if (!draft) return { outcome: 'composition_parse_failed', gapId: gap.id, reasoner: composed.reasoner.label }
    const validation = validateCognitiveCompositionDraft(draft, available.map(item => item.skillKey))
    if (!validation.ok) {
      return { outcome: 'composition_structure_rejected', gapId: gap.id, reasons: validation.reasons, reasoner: composed.reasoner.label }
    }
    const compositionRow = await persistCompositionDraft(gap, draft, composed.reasoner.label)
    const practiceQueued = await generateLocalCompositionPractice(String(gap.question), draft, compositionRow.composition_key)
    const evaluation = await independentlyEvaluateComposition(String(gap.question), compositionRow)
    return {
      outcome: 'composition_candidate_created',
      gapId: gap.id,
      compositionKey: compositionRow.composition_key,
      memberSkillKeys: compositionRow.member_skill_keys,
      opportunity,
      practiceQueued,
      evaluation,
      reasoner: composed.reasoner.label,
    }
  }
  return waiting ?? { outcome: 'no_multi_skill_transfer_opportunity', scannedGaps: (gaps.data ?? []).length }
}

async function claimNextCompositionTrial(): Promise<any | null> {
  const db = cosServiceDb()
  if (!db) return null
  const result = await db.from('cos_cognitive_composition_trials')
    .select('*')
    .eq('status', 'queued')
    .lte('next_attempt_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (result.error) throw result.error
  if (!result.data) return null
  const claimed = await db.from('cos_cognitive_composition_trials').update({
    status: 'running',
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', result.data.id).eq('status', 'queued').select('*').maybeSingle()
  if (claimed.error) throw claimed.error
  return claimed.data ?? null
}

async function solveWithProcedure(args: {
  task: string
  procedure: unknown
  systemPrompt: string
  maxTokens?: number
}): Promise<{ answer: string; confidence: number | null; reasoner: string | null }> {
  const result = await callCosReasoner({
    temperature: 0,
    maxTokens: args.maxTokens || 3000,
    systemPrompt: args.systemPrompt,
    prompt: `PROCEDURAL GUIDANCE (how-to guidance, not factual evidence):\n${clean(JSON.stringify(args.procedure), 22000)}\n\nUNSEEN CASE:\n${clean(args.task, 12000)}\n\nSolve from the case itself. Return strict JSON only: {"answer":"...","confidence":0..1}.`,
  })
  const parsed = result?.text ? parseLocalResult(result.text) : null
  return { answer: parsed?.answer || '', confidence: parsed?.confidence ?? null, reasoner: result?.reasoner.label || null }
}

export async function runNextCognitiveCompositionTrial(): Promise<Record<string, unknown> | null> {
  const db = cosServiceDb()
  if (!db) return null
  const trial = await claimNextCompositionTrial()
  if (!trial) return null

  try {
    const compositionResult = await db.from('cos_cognitive_skill_compositions').select('*').eq('composition_key', trial.composition_key).maybeSingle()
    if (compositionResult.error || !compositionResult.data) throw new Error('composition_missing')
    const composition = compositionResult.data as any
    if (composition.quarantined_at || composition.weakened_at) throw new Error('composition_not_eligible_for_trial')
    const memberKeys = Array.isArray(composition.member_skill_keys) ? composition.member_skill_keys.map(String) : []
    const members = await loadStrongMemberRows(memberKeys)
    if (members.length !== memberKeys.length) throw new Error('composition_member_no_longer_strong')
    if (trial.exercise_kind === 'transfer' && trial.generation_source === 'local_generator') throw new Error('invalid_local_transfer_case')
    if (trial.exercise_kind === 'transfer' && !composition.evaluator_approved) throw new Error('transfer_requires_evaluator_approval')

    const composite = await solveWithProcedure({
      task: trial.prompt,
      procedure: composition.plan,
      systemPrompt: 'Apply the bounded multi-skill composition independently. Preserve member prerequisites, handoffs, observables, falsifiers, and prohibited actions. The composition is procedural guidance, not factual evidence.',
    })
    const compositeGrade = evaluateAnswerAgainstRubric(composite.answer, trial.rubric || {})
    const baselines: Array<{ skillKey: string; score: number; pass: boolean; coverage: number; reasoner: string | null }> = []

    if (trial.exercise_kind === 'transfer') {
      for (const member of members) {
        const baseline = await solveWithProcedure({
          task: trial.prompt,
          procedure: member.procedure,
          systemPrompt: 'Solve using ONLY this single procedural skill. Do not borrow other stored skills. Return strict JSON only. This is a baseline for a composition transfer experiment.',
          maxTokens: 2600,
        })
        const grade = evaluateAnswerAgainstRubric(baseline.answer, trial.rubric || {})
        baselines.push({ skillKey: String(member.skill_key), score: grade.score, pass: grade.pass, coverage: grade.coverage, reasoner: baseline.reasoner })
      }
    }
    const best = baselines.slice().sort((a, b) => b.score - a.score)[0] || null
    const rpc = await db.rpc('cos_record_cognitive_composition_trial_result', {
      p_trial_id: trial.id,
      p_composite_success: compositeGrade.pass,
      p_composite_score: compositeGrade.score,
      p_best_member_skill_key: best?.skillKey || null,
      p_best_member_success: best?.pass ?? null,
      p_best_member_score: best?.score ?? null,
      p_baseline_scores: baselines,
      p_evidence: {
        composite: {
          coverage: compositeGrade.coverage,
          matchedGroups: compositeGrade.matchedGroups,
          totalGroups: compositeGrade.totalGroups,
          reason: compositeGrade.reason,
          reasoner: composite.reasoner,
          localConfidence: composite.confidence,
        },
        experiment: trial.exercise_kind === 'transfer' ? 'same_case_composite_vs_each_single_member' : 'local_composition_practice',
      },
    })
    if (rpc.error) throw rpc.error
    const lifecycle = await refreshCognitiveCompositionStatus(trial.composition_key)
    return {
      trialId: trial.id,
      compositionKey: trial.composition_key,
      kind: trial.exercise_kind,
      compositePassed: compositeGrade.pass,
      compositeScore: compositeGrade.score,
      bestSingleMember: best,
      advantage: best ? compositeGrade.score - best.score : null,
      lifecycle,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.from('cos_cognitive_composition_trials').update({
      status: 'blocked',
      evidence: { blockedReason: clean(message, 2000) },
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', trial.id)
    return { trialId: trial.id, compositionKey: trial.composition_key, kind: trial.exercise_kind, blocked: true, error: message }
  }
}

export type CognitiveCompositionCycleSummary = {
  enabled: boolean
  candidate: Record<string, unknown> | null
  trials: Record<string, unknown>[]
  errors: string[]
}

/**
 * Bounded hierarchical-skill learning. A pending learning gap can trigger composition only when at
 * least two validated skills have distributed relevance. Local practice is cheap; independent
 * transfer validation is optional and provider-neutral. A validated composition is promoted back
 * into procedural memory as a new skill, enabling later hierarchical compositions.
 */
export async function runCognitiveCompositionCycle(): Promise<CognitiveCompositionCycleSummary> {
  if (process.env.COS_COGNITIVE_COMPOSITION_ENABLED === 'false') {
    return { enabled: false, candidate: null, trials: [], errors: [] }
  }
  const trialLimit = positiveInt(process.env.COS_COGNITIVE_COMPOSITION_TRIALS_PER_CYCLE, 1, 2)
  const summary: CognitiveCompositionCycleSummary = { enabled: true, candidate: null, trials: [], errors: [] }
  try {
    summary.candidate = await createOrAdvanceCognitiveComposition()
  } catch (error) {
    summary.errors.push(`candidate:${error instanceof Error ? error.message : String(error)}`)
  }
  for (let index = 0; index < trialLimit; index += 1) {
    try {
      const trial = await runNextCognitiveCompositionTrial()
      if (!trial) break
      summary.trials.push(trial)
    } catch (error) {
      summary.errors.push(`trial:${error instanceof Error ? error.message : String(error)}`)
      break
    }
  }
  return summary
}
