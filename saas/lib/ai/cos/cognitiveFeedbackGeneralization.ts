import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { callCosReasoner } from '@/lib/ai/cos/cosReasoner'
import {
  buildLocalPracticeGenerationPrompt,
  cognitiveSkillProcedure,
  parseCognitiveSkillDraft,
  parsePracticeVariants,
  skillKeyForDraft,
  validateCognitiveSkillDraft,
  type CognitiveSkillDraft,
} from '@/lib/ai/cos/cognitiveSkillCandidate'
import { classifyProblemClass } from '@/lib/ai/cos/cosProblemClass'

function clean(value: unknown, max = 6000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export type FeedbackGeneralizationInput = {
  experienceHash: string
  prompt: string
  assistantContent: string
  feedbackType: 'negative' | 'correction'
  correctionText?: string | null
}

export type FeedbackGeneralizationResult = {
  attempted: boolean
  candidateCreated: boolean
  skillKey: string | null
  localPracticeQueued: number
  reason: string
}

/**
 * User feedback is an episodic signal, never truth. This prompt asks COS to learn only a transferable
 * method that would have prevented the failure class. It explicitly forbids copying the answer,
 * person/place names, one-off values, or the user's correction as a factual rule.
 */
export function buildFeedbackGeneralizationPrompt(input: FeedbackGeneralizationInput): string {
  return [
    'Convert this explicit user feedback into a GENERALIZED PROCEDURAL REASONING candidate for COS.',
    'The user correction/negative feedback is an experience signal, NOT verified factual truth.',
    'Learn a reusable method, not the answer to this one question.',
    'Do not encode names, places, dates, numeric answers, or one-off facts unless they are abstract placeholders.',
    'Do not create a factual claim. Do not create a user preference. Do not create an execution permission.',
    'The candidate must transfer to materially different unseen questions and must be falsifiable.',
    'If the feedback only changes a one-off fact and contains no reusable reasoning lesson, return {"noReusableSkill":true,"reason":"one_off_fact_only"}.',
    '',
    `PROBLEM CLASS: ${classifyProblemClass(input.prompt)}`,
    `ORIGINAL QUESTION: ${clean(input.prompt, 12000)}`,
    `COS ANSWER THAT RECEIVED FEEDBACK: ${clean(input.assistantContent, 16000)}`,
    `FEEDBACK TYPE: ${input.feedbackType}`,
    `USER CORRECTION/SIGNAL: ${clean(input.correctionText, 4000) || '(none)'}`,
    '',
    'Return strict JSON only. Either:',
    '{"noReusableSkill":true,"reason":"..."}',
    'or a skill object with keys: title, description, problemClass, prerequisites, procedureSteps, discriminatingSignals, tools, observables, falsifiers, commonFailureModes, prohibitedActions.',
    'A valid skill needs at least three procedureSteps, two discriminatingSignals, two observables, and two falsifiers.',
  ].join('\n')
}

function noReusableSkill(raw: string): boolean {
  try {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start < 0 || end <= start) return false
    const parsed = JSON.parse(raw.slice(start, end + 1))
    return parsed?.noReusableSkill === true
  } catch {
    return false
  }
}

async function persistFeedbackDraft(input: FeedbackGeneralizationInput, draft: CognitiveSkillDraft, reasonerLabel: string) {
  const db = cosServiceDb()
  if (!db) return null
  const skillKey = skillKeyForDraft(draft)
  const existing = await db.from('cos_cognitive_skills').select('*').eq('skill_key', skillKey).maybeSingle()
  if (existing.error) throw existing.error
  const now = new Date().toISOString()
  const sourceHash = clean(input.experienceHash, 128)
  const sourceHashes = [...new Set([
    ...(Array.isArray(existing.data?.provenance?.feedback_experience_hashes) ? existing.data.provenance.feedback_experience_hashes : []),
    sourceHash,
  ].filter(Boolean))].slice(-20)
  const provenance = {
    ...(existing.data?.provenance && typeof existing.data.provenance === 'object' ? existing.data.provenance : {}),
    origin: 'user_feedback_reflection',
    feedback_experience_hashes: sourceHashes,
    local_reflector: reasonerLabel,
    raw_conversation_stored_in_skill: false,
  }
  const metadata = {
    ...(existing.data?.metadata && typeof existing.data.metadata === 'object' ? existing.data.metadata : {}),
    activation_rule: 'never inject until status is validated, learned, or mastered',
    confidence_rule: 'skill lifecycle status must not increase answer confidence',
    feedback_signal_semantics: 'experience_not_verified_truth',
    generalization_rule: 'abstract reusable reasoning only; no one-off facts or user preferences',
  }

  if (existing.data?.id) {
    const strong = ['validated', 'learned', 'mastered'].includes(String(existing.data.status))
    const patch: Record<string, unknown> = {
      encounter_count: Number(existing.data.encounter_count || 0) + 1,
      provenance,
      metadata,
      updated_at: now,
    }
    if (!strong && String(existing.data.status) !== 'quarantined') {
      patch.title = draft.title
      patch.description = draft.description
      patch.procedure = cognitiveSkillProcedure(draft)
    }
    const updated = await db.from('cos_cognitive_skills').update(patch).eq('id', existing.data.id).select('*').single()
    if (updated.error) throw updated.error
    return updated.data
  }

  const inserted = await db.from('cos_cognitive_skills').insert({
    skill_key: skillKey,
    subject: classifyProblemClass(input.prompt) || draft.problemClass,
    title: draft.title,
    description: draft.description,
    procedure: cognitiveSkillProcedure(draft),
    status: 'encountered',
    evaluator_approved: false,
    understanding_approved: false,
    encounter_count: 1,
    provenance,
    metadata,
    updated_at: now,
  }).select('*').single()
  if (inserted.error) throw inserted.error
  return inserted.data
}

async function queueLocalPractice(input: FeedbackGeneralizationInput, draft: CognitiveSkillDraft, skillKey: string): Promise<number> {
  const reasoned = await callCosReasoner({
    temperature: 0.35,
    maxTokens: 2200,
    systemPrompt: 'Generate transfer-learning practice cases. Return only strict JSON and never provide answers.',
    prompt: buildLocalPracticeGenerationPrompt({ sourcePrompt: input.prompt, draft }),
  }).catch(() => null)
  if (!reasoned?.text) return 0
  const variants = parsePracticeVariants(reasoned.text).slice(0, 2)
  const db = cosServiceDb()
  if (!db) return 0
  let queued = 0
  for (const variant of variants) {
    const result = await db.from('cos_active_practice_queue').upsert({
      skill_key: skillKey,
      teacher_lesson_id: null,
      variant_key: clean(variant.variantKey, 160),
      exercise_kind: 'practice',
      prompt: clean(variant.prompt, 12000),
      rubric: variant.rubric,
      generation_source: 'local_generator',
      evaluator_mode: 'deterministic_rubric',
      max_attempts: 2,
      status: 'queued',
      metadata: {
        origin: 'user_feedback_generalization',
        source_experience_hash: clean(input.experienceHash, 128),
        cannot_count_as_independent_holdout: true,
      },
      next_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'skill_key,exercise_kind,variant_key', ignoreDuplicates: true })
    if (!result.error) queued += 1
  }
  return queued
}

/**
 * Capture a transferable reasoning candidate from explicit negative/corrective feedback.
 * This NEVER promotes the skill. It creates/refreshes an `encountered` candidate and local practice;
 * the existing independent evaluator/understanding/holdout lifecycle is still required before live use.
 */
export async function generalizeFeedbackIntoCognitiveSkill(input: FeedbackGeneralizationInput): Promise<FeedbackGeneralizationResult> {
  const reflected = await callCosReasoner({
    temperature: 0.1,
    maxTokens: 3000,
    systemPrompt: 'You are COS reflecting on explicit user feedback. Extract only transferable procedural reasoning. Return strict JSON.',
    prompt: buildFeedbackGeneralizationPrompt(input),
  }).catch(() => null)

  if (!reflected?.text) return { attempted: true, candidateCreated: false, skillKey: null, localPracticeQueued: 0, reason: 'local_reflection_unavailable' }
  if (noReusableSkill(reflected.text)) return { attempted: true, candidateCreated: false, skillKey: null, localPracticeQueued: 0, reason: 'no_reusable_skill' }

  const draft = parseCognitiveSkillDraft(reflected.text)
  if (!draft) return { attempted: true, candidateCreated: false, skillKey: null, localPracticeQueued: 0, reason: 'candidate_parse_failed' }
  const validation = validateCognitiveSkillDraft(draft)
  if (!validation.ok) return { attempted: true, candidateCreated: false, skillKey: null, localPracticeQueued: 0, reason: `candidate_rejected:${validation.reasons.join(',')}` }

  const row = await persistFeedbackDraft(input, draft, reflected.reasoner.label)
  if (!row?.skill_key) return { attempted: true, candidateCreated: false, skillKey: null, localPracticeQueued: 0, reason: 'skill_store_unavailable' }
  const localPracticeQueued = await queueLocalPractice(input, draft, String(row.skill_key))
  return { attempted: true, candidateCreated: true, skillKey: String(row.skill_key), localPracticeQueued, reason: 'candidate_encountered_requires_independent_validation' }
}
