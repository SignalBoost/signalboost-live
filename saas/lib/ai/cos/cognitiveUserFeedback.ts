import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { classifyProblemClass } from '@/lib/ai/cos/cosProblemClass'

export type CosUserFeedbackType = 'positive' | 'negative' | 'correction'

export type CosUserFeedbackInput = {
  userId: string
  conversationId: string
  prompt: string
  assistantContent: string
  feedbackType: CosUserFeedbackType
  correctionText?: string | null
  occurredAt?: string
}

export type CosUserFeedbackDecision = {
  eligible: boolean
  reason: string
  subject: string
  promptHash: string
  assistantResponseHash: string
  experienceHash: string
  sourceRef: string
  success: boolean | null
  score: number | null
  evidence: Record<string, unknown>
}

const MAX_PROMPT_CHARS = 20_000
const MAX_ASSISTANT_CHARS_FOR_HASH = 80_000
const MAX_CORRECTION_CHARS = 4_000

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function resultFor(type: CosUserFeedbackType): { success: boolean | null; score: number | null } {
  if (type === 'positive') return { success: true, score: 1 }
  if (type === 'negative') return { success: false, score: 0 }
  return { success: null, score: null }
}

/**
 * Convert explicit user feedback into bounded episodic evidence.
 *
 * A user correction is valuable learning input, but it is not verified factual truth and cannot
 * automatically create a Knowledge Graph fact, learned-corpus item, procedural skill, confidence
 * bonus, or execution permission. Later curriculum/reconsolidation code may inspect this signal and
 * independently validate what should be learned from it.
 */
export function decideCosUserFeedbackExperience(input: CosUserFeedbackInput): CosUserFeedbackDecision {
  const userId = clean(input.userId, 200)
  const conversationId = clean(input.conversationId, 200)
  const prompt = clean(input.prompt, MAX_PROMPT_CHARS)
  const assistantContent = String(input.assistantContent ?? '').trim().slice(0, MAX_ASSISTANT_CHARS_FOR_HASH)
  const feedbackType = input.feedbackType
  const correctionText = clean(input.correctionText, MAX_CORRECTION_CHARS)
  const promptHash = sha256(prompt)
  const assistantResponseHash = sha256(assistantContent)
  const conversationRefHash = sha256(`${userId}:${conversationId}`)
  const correctionHash = correctionText ? sha256(correctionText) : null
  const { success, score } = resultFor(feedbackType)
  const experienceHash = sha256([
    'user-feedback-v2',
    conversationRefHash,
    promptHash,
    assistantResponseHash,
    feedbackType,
    correctionHash || '',
  ].join(':'))
  const sourceRef = `assistant-feedback:${conversationRefHash}:${promptHash}:${assistantResponseHash}`
  const subject = classifyProblemClass(prompt)

  let reason = 'explicit_user_feedback'
  let eligible = true
  if (!userId || !conversationId) {
    eligible = false
    reason = 'missing_identity_or_conversation'
  } else if (!prompt || !assistantContent) {
    eligible = false
    reason = 'missing_prompt_or_assistant_response'
  } else if (!['positive', 'negative', 'correction'].includes(feedbackType)) {
    eligible = false
    reason = 'invalid_feedback_type'
  } else if (feedbackType === 'correction' && !correctionText) {
    eligible = false
    reason = 'correction_text_required'
  }

  return {
    eligible,
    reason,
    subject,
    promptHash,
    assistantResponseHash,
    experienceHash,
    sourceRef,
    success,
    score,
    evidence: eligible ? {
      schemaVersion: 2,
      semantics: 'user_feedback_signal_not_verified_truth',
      feedbackType,
      feedbackSemantics: 'explicit_user_feedback_requires_independent_validation_before_promotion',
      promptHash,
      assistantResponseHash,
      conversationRefHash,
      correctionText: feedbackType === 'correction' ? correctionText : null,
      correctionHash,
      correctionSemantics: feedbackType === 'correction'
        ? 'unverified_user_correction_requires_validation'
        : null,
      verifiedOutcome: false,
      automaticFactPromotionAllowed: false,
      automaticSkillPromotionAllowed: false,
      confidenceBonusAllowed: false,
      executionAuthorityChangeAllowed: false,
      curriculumSignalEligible: feedbackType !== 'positive',
    } : {},
  }
}

/** Persist explicit user feedback as episodic memory only. */
export async function recordCosUserFeedbackExperience(
  input: CosUserFeedbackInput,
): Promise<{ stored: boolean; repeated: boolean; decision: CosUserFeedbackDecision }> {
  const decision = decideCosUserFeedbackExperience(input)
  if (!decision.eligible) return { stored: false, repeated: false, decision }

  const db = cosServiceDb()
  if (!db) return { stored: false, repeated: false, decision }
  const now = input.occurredAt || new Date().toISOString()

  try {
    const existing = await db
      .from('cos_cognitive_experiences')
      .select('id,occurrence_count')
      .eq('experience_hash', decision.experienceHash)
      .maybeSingle()
    if (existing.error) throw existing.error

    if (existing.data?.id) {
      const update = await db
        .from('cos_cognitive_experiences')
        .update({
          success: decision.success,
          score: decision.score,
          occurrence_count: Number(existing.data.occurrence_count || 1) + 1,
          evidence: decision.evidence,
          last_observed_at: now,
          updated_at: now,
        })
        .eq('id', existing.data.id)
      if (update.error) throw update.error
      return { stored: true, repeated: true, decision }
    }

    const insert = await db.from('cos_cognitive_experiences').insert({
      experience_hash: decision.experienceHash,
      subject: decision.subject,
      experience_kind: 'feedback',
      prompt_hash: decision.promptHash,
      source_kind: 'user_feedback',
      source_ref: decision.sourceRef,
      success: decision.success,
      score: decision.score,
      evidence: decision.evidence,
      first_observed_at: now,
      last_observed_at: now,
      updated_at: now,
    })
    if (insert.error) throw insert.error
    return { stored: true, repeated: false, decision }
  } catch (error) {
    console.warn('[cos-user-feedback-learning] failed to persist feedback experience', error)
    return { stored: false, repeated: false, decision }
  }
}
