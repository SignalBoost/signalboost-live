// saas/lib/ai/cos/turnExperienceStore.ts
//
// Persistence for the per-turn execution record.
//
// This is observability for a learning loop, never an answer dependency. A failed insert must not
// delay, degrade, or fail the user turn. In Next request contexts `after()` keeps the write alive
// after the response; outside a request (tests/background jobs) we fall back to best-effort async.

import { createHash, createHmac } from 'node:crypto'
import { after } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { surfaceDifficulty, type TurnExperience } from '@/lib/ai/cos/turnExperience'

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
}

/**
 * Attach a later outcome to a previously-recorded turn.
 *
 * Undefined means "still unknown", not false. A later stronger signal (for example a verified
 * production outcome) can therefore enrich a turn without erasing an earlier weaker signal.
 */
export async function attachTurnOutcome(turnId: string, outcome: TurnOutcome): Promise<boolean> {
  try {
    const db = cosServiceDb()
    if (!db) return false
    const update: Record<string, unknown> = {
      outcome_at: new Date().toISOString(),
      outcome_source: String(outcome.source || 'unknown').slice(0, 120),
    }
    if (outcome.repairNeeded !== undefined) update.repair_needed = outcome.repairNeeded
    if (outcome.escalated !== undefined) update.escalated = outcome.escalated
    if (outcome.userFeedback !== undefined) update.user_feedback = String(outcome.userFeedback).slice(0, 400)
    if (outcome.verifiedSuccess !== undefined) update.verified_success = outcome.verifiedSuccess

    const result = await db.from('cos_turn_experience').update(update).eq('turn_id', turnId)
    if (result.error) throw result.error
    return true
  } catch (error) {
    console.warn('[cos-turn-experience] outcome attach failed (non-fatal):', error instanceof Error ? error.message : String(error))
    return false
  }
}
