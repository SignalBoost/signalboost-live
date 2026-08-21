// saas/lib/ai/cos/turnExperienceStore.ts
//
// Persistence for the per-turn execution record and independent outcome correlation.
//
// Execution observability is never an answer dependency. The execution row is intentionally written
// after the response; outcomes therefore live in a separate turn_id-keyed table so feedback and
// benchmarks can arrive before, during or long after the telemetry insert without racing it.

import { createHash, createHmac } from 'node:crypto'
import { after } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { surfaceDifficulty, type TurnExperience } from '@/lib/ai/cos/turnExperience'
import { captureEvidenceSourceUseTurnId } from '@/lib/ai/cos/evidenceSourceUseTurnContext'

function normalizedPrompt(prompt: string): string {
  return String(prompt ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function promptHashKey(): string | null {
  return process.env.COS_TURN_EXPERIENCE_HASH_KEY?.trim()
    || process.env.NEXTAUTH_SECRET?.trim()
    || process.env.CRON_SECRET?.trim()
    || null
}

/** Stable per-question correlation key. The prompt itself is never stored. */
export function hashPrompt(prompt: string): string {
  const normalized = normalizedPrompt(prompt)
  const key = promptHashKey()
  return key
    ? createHmac('sha256', key).update(normalized).digest('hex')
    : createHash('sha256').update(normalized).digest('hex')
}

async function persistTurnExperience(experience: TurnExperience): Promise<void> {
  try {
    const db = cosServiceDb()
    if (!db) return
    const result = await db.from('cos_turn_experience').insert({
      turn_id: experience.turnId,
      prompt_hash: experience.promptHash,
      features: experience.features,
      surface_difficulty: surfaceDifficulty(experience.features),
      reasoner_label: experience.reasonerLabel,
      phases: experience.phases,
      skipped: experience.skipped,
      total_ms: experience.totalMs,
      model_call_ms: experience.modelCallMs,
      other_ms: experience.otherMs,
      model_calls: experience.modelCalls,
      answered: experience.answered,
    })
    if (result.error) throw result.error
  } catch (error) {
    console.warn('[cos-turn-experience] record failed (non-fatal):', error instanceof Error ? error.message : String(error))
  }
}

export function recordTurnExperience(experience: TurnExperience): void {
  // Publish the reasoner's UUID synchronously. Answer provenance and source-use attribution can read
  // it immediately even though the database telemetry itself is intentionally deferred.
  captureEvidenceSourceUseTurnId(experience.turnId)
  try {
    after(() => persistTurnExperience(experience))
  } catch {
    // `after()` requires a Next request context. Background learning and unit tests may legitimately
    // call the reasoner without one; in those environments preserve the non-blocking contract.
    void persistTurnExperience(experience)
  }
}

export type TurnOutcome = {
  repairNeeded?: boolean
  escalated?: boolean
  userFeedback?: string
  verifiedSuccess?: boolean
  source: string
  occurredAt?: string
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

/**
 * Attach or enrich an outcome independently from the execution row.
 *
 * Undefined means "still unknown", not false. The database merge function only replaces fields
 * explicitly supplied by the new evidence, so a later verified outcome can enrich earlier feedback
 * without erasing it. A best-effort mirror keeps legacy cos_turn_experience readers useful when that
 * row already exists; authoritative outcome readers use cos_turn_outcomes.
 */
export async function attachTurnOutcome(turnId: string, outcome: TurnOutcome): Promise<boolean> {
  try {
    const cleanTurnId = String(turnId ?? '').trim()
    if (!isUuid(cleanTurnId)) return false
    const db = cosServiceDb()
    if (!db) return false
    const occurredAt = outcome.occurredAt && Number.isFinite(Date.parse(outcome.occurredAt))
      ? new Date(outcome.occurredAt).toISOString()
      : new Date().toISOString()
    const source = String(outcome.source || 'unknown').slice(0, 120)
    const feedback = outcome.userFeedback === undefined ? null : String(outcome.userFeedback).slice(0, 400)

    const merged = await db.rpc('cos_merge_turn_outcome', {
      p_turn_id: cleanTurnId,
      p_repair_needed: outcome.repairNeeded ?? null,
      p_escalated: outcome.escalated ?? null,
      p_user_feedback: feedback,
      p_verified_success: outcome.verifiedSuccess ?? null,
      p_outcome_source: source,
      p_outcome_at: occurredAt,
    })
    if (merged.error) throw merged.error

    // Backward-compatible mirror only. It is allowed to affect zero rows when the post-response
    // execution insert has not happened yet; cos_turn_outcomes remains the durable authority.
    const update: Record<string, unknown> = {
      outcome_at: occurredAt,
      outcome_source: source,
    }
    if (outcome.repairNeeded !== undefined) update.repair_needed = outcome.repairNeeded
    if (outcome.escalated !== undefined) update.escalated = outcome.escalated
    if (feedback !== null) update.user_feedback = feedback
    if (outcome.verifiedSuccess !== undefined) update.verified_success = outcome.verifiedSuccess
    await db.from('cos_turn_experience').update(update).eq('turn_id', cleanTurnId)

    return true
  } catch (error) {
    console.warn('[cos-turn-experience] outcome attach failed (non-fatal):', error instanceof Error ? error.message : String(error))
    return false
  }
}
