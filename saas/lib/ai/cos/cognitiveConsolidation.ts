import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { callCosReasoner } from '@/lib/ai/cos/cosReasoner'
import { parseLocalResult } from '@/lib/ai/cos/reasonerOutput'
import { evaluateAnswerAgainstRubric } from '@/lib/ai/cos/cognitiveSkillCandidate'
import { refreshCognitiveSkillStatus } from '@/lib/ai/cos/cognitiveActiveLearning'
import { DEFAULT_COGNITIVE_RETENTION_POLICY } from '@/lib/ai/cos/cognitiveRetentionPolicy'

const STRONG_STATUSES = ['validated', 'learned', 'mastered'] as const
const RETENTION_STATUSES = ['validated', 'learned', 'mastered', 'weakened'] as const

function clean(value: unknown, max = 6000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function positiveInt(value: unknown, fallback: number, max = 20): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, Math.min(max, Math.floor(parsed))) : fallback
}

function retryAt(days: number): string {
  return new Date(Date.now() + Math.max(1, days) * 86_400_000).toISOString()
}

export async function weakenStaleCognitiveSkills(limit = 4): Promise<Array<Record<string, unknown>>> {
  const db = cosServiceDb()
  if (!db) return []
  const cutoff = new Date(Date.now() - DEFAULT_COGNITIVE_RETENTION_POLICY.staleValidationDays * 86_400_000).toISOString()
  const result = await db.from('cos_cognitive_skills')
    .select('*')
    .in('status', [...STRONG_STATUSES])
    .lt('last_validated_at', cutoff)
    .order('last_validated_at', { ascending: true })
    .limit(Math.max(1, limit))
  if (result.error) throw result.error

  const weakened: Array<Record<string, unknown>> = []
  for (const row of result.data || []) {
    const now = new Date().toISOString()
    const audit = await db.from('cos_learning_promotions').insert({
      skill_key: row.skill_key,
      from_status: row.status,
      to_status: 'weakened',
      evidence: {
        lastValidatedAt: row.last_validated_at,
        staleValidationDays: DEFAULT_COGNITIVE_RETENTION_POLICY.staleValidationDays,
        retentionAttempts: row.retention_attempts || 0,
        retentionSuccesses: row.retention_successes || 0,
      },
      policy_version: 'cognitive-retention-v1',
      reason: 'Validation freshness expired before a successful retention check.',
    })
    if (audit.error) throw audit.error
    const update = await db.from('cos_cognitive_skills').update({
      status: 'weakened',
      weakened_at: now,
      next_retention_due_at: now,
      updated_at: now,
    }).eq('id', row.id)
    if (update.error) throw update.error
    weakened.push({ skillKey: row.skill_key, fromStatus: row.status, reason: 'stale_validation' })
  }
  return weakened
}

export async function scheduleDueRetentionChecks(limit = 4): Promise<Array<Record<string, unknown>>> {
  const db = cosServiceDb()
  if (!db) return []
  const now = new Date().toISOString()
  const due = await db.from('cos_cognitive_skills')
    .select('*')
    .in('status', [...RETENTION_STATUSES])
    .lte('next_retention_due_at', now)
    .order('next_retention_due_at', { ascending: true })
    .limit(Math.max(1, limit))
  if (due.error) throw due.error

  const scheduled: Array<Record<string, unknown>> = []
  for (const skill of due.data || []) {
    const pending = await db.from('cos_retention_checks')
      .select('id,status')
      .eq('skill_key', skill.skill_key)
      .in('status', ['queued', 'running'])
      .limit(1)
      .maybeSingle()
    if (pending.error) throw pending.error
    if (pending.data) {
      scheduled.push({ skillKey: skill.skill_key, existingCheck: pending.data.id })
      continue
    }

    const source = await db.from('cos_active_practice_queue')
      .select('*')
      .eq('skill_key', skill.skill_key)
      .eq('exercise_kind', 'holdout')
      .eq('status', 'passed')
      .neq('generation_source', 'local_generator')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (source.error) throw source.error

    if (!source.data) {
      const metadata = skill.metadata && typeof skill.metadata === 'object' ? skill.metadata : {}
      const defer = await db.from('cos_cognitive_skills').update({
        next_retention_due_at: retryAt(7),
        metadata: {
          ...metadata,
          retention_blocked: {
            at: now,
            reason: 'no_prior_independent_holdout_available',
          },
        },
        updated_at: now,
      }).eq('id', skill.id)
      if (defer.error) throw defer.error
      scheduled.push({ skillKey: skill.skill_key, blocked: true, reason: 'no_prior_independent_holdout_available' })
      continue
    }

    const insert = await db.from('cos_retention_checks').insert({
      skill_key: skill.skill_key,
      source_queue_id: source.data.id,
      prompt: source.data.prompt,
      rubric: source.data.rubric || {},
      retention_source: 'delayed_independent_replay',
      scheduled_from_status: skill.status,
      status: 'queued',
      due_at: now,
      metadata: {
        originalGenerationSource: source.data.generation_source,
        originalCompletedAt: source.data.completed_at,
        evidenceSemantics: 'retention_only_not_new_holdout_breadth',
      },
      updated_at: now,
    }).select('id').single()
    if (insert.error) throw insert.error
    scheduled.push({ skillKey: skill.skill_key, checkId: insert.data.id, sourceQueueId: source.data.id })
  }
  return scheduled
}

async function claimNextRetentionCheck(): Promise<any | null> {
  const db = cosServiceDb()
  if (!db) return null
  const result = await db.from('cos_retention_checks')
    .select('*')
    .eq('status', 'queued')
    .lte('due_at', new Date().toISOString())
    .order('due_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (result.error) throw result.error
  if (!result.data) return null
  const claimed = await db.from('cos_retention_checks').update({
    status: 'running',
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', result.data.id).eq('status', 'queued').select('*').maybeSingle()
  if (claimed.error) throw claimed.error
  return claimed.data ?? null
}

export async function runNextCognitiveRetention(): Promise<Record<string, unknown> | null> {
  const db = cosServiceDb()
  if (!db) return null
  const check = await claimNextRetentionCheck()
  if (!check) return null

  try {
    const skillResult = await db.from('cos_cognitive_skills').select('*').eq('skill_key', check.skill_key).maybeSingle()
    if (skillResult.error || !skillResult.data) throw new Error('retention_skill_missing')
    const skill = skillResult.data as any
    if (skill.quarantined_at || skill.status === 'quarantined') {
      await db.from('cos_retention_checks').update({
        status: 'discarded',
        last_error: 'skill_quarantined',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', check.id)
      return { checkId: check.id, skillKey: check.skill_key, discarded: true, reason: 'skill_quarantined' }
    }

    const reasoned = await callCosReasoner({
      temperature: 0,
      maxTokens: 3200,
      systemPrompt: 'Re-demonstrate the procedural skill after a delay. Return strict JSON only: {"answer":"...","confidence":0..1}. The skill is how-to guidance, not factual evidence.',
      prompt: `PROCEDURAL SKILL:\n${clean(JSON.stringify(skill.procedure), 15000)}\n\nDELAYED RETENTION CHECK:\n${clean(check.prompt, 12000)}\n\nSolve independently from the case. You cannot see the grading rubric. This replay tests retention only and must not be treated as a new held-out variant.`,
    })
    const parsed = reasoned?.text ? parseLocalResult(reasoned.text) : null
    const grade = evaluateAnswerAgainstRubric(parsed?.answer || '', check.rubric || {})
    const passed = Boolean(parsed) && grade.pass
    const rpc = await db.rpc('cos_record_cognitive_retention_result', {
      p_check_id: check.id,
      p_success: passed,
      p_score: grade.score,
      p_answer: parsed?.answer || '',
      p_evidence: {
        ...grade,
        localConfidence: parsed?.confidence ?? null,
        localReasoner: reasoned?.reasoner.label || null,
        retentionOnly: true,
      },
    })
    if (rpc.error) throw rpc.error

    const lifecycle = passed ? await refreshCognitiveSkillStatus(check.skill_key) : null
    return {
      checkId: check.id,
      skillKey: check.skill_key,
      passed,
      score: grade.score,
      coverage: grade.coverage,
      result: rpc.data,
      lifecycle,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.from('cos_retention_checks').update({
      status: 'blocked',
      last_error: clean(message, 2000),
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', check.id)
    await db.from('cos_cognitive_skills').update({
      next_retention_due_at: retryAt(1),
      updated_at: new Date().toISOString(),
    }).eq('skill_key', check.skill_key)
    return { checkId: check.id, skillKey: check.skill_key, blocked: true, error: message }
  }
}

export type CognitiveConsolidationSummary = {
  enabled: boolean
  weakened: Array<Record<string, unknown>>
  scheduled: Array<Record<string, unknown>>
  retention: Array<Record<string, unknown>>
  errors: string[]
}

/**
 * Bounded consolidation/retention pass, intended to run inside the existing daily COS mining job.
 * It does not generate new promotion holdouts and it does not change answer confidence. A delayed
 * replay can refresh retention/freshness, but cannot increase held-out breadth. Repeated retention
 * failures weaken a skill; explicit verified production contradictions quarantine it through the
 * separate production-outcome RPC.
 */
export async function runCognitiveConsolidationCycle(): Promise<CognitiveConsolidationSummary> {
  if (process.env.COS_COGNITIVE_CONSOLIDATION_ENABLED === 'false') {
    return { enabled: false, weakened: [], scheduled: [], retention: [], errors: [] }
  }
  const staleLimit = positiveInt(process.env.COS_COGNITIVE_STALE_SKILLS_PER_CYCLE, 4, 10)
  const scheduleLimit = positiveInt(process.env.COS_COGNITIVE_RETENTION_SCHEDULE_PER_CYCLE, 4, 10)
  const retentionLimit = positiveInt(process.env.COS_COGNITIVE_RETENTION_CHECKS_PER_CYCLE, 2, 6)
  const summary: CognitiveConsolidationSummary = { enabled: true, weakened: [], scheduled: [], retention: [], errors: [] }

  try {
    summary.weakened = await weakenStaleCognitiveSkills(staleLimit)
  } catch (error) {
    summary.errors.push(`stale:${error instanceof Error ? error.message : String(error)}`)
  }

  try {
    summary.scheduled = await scheduleDueRetentionChecks(scheduleLimit)
  } catch (error) {
    summary.errors.push(`schedule:${error instanceof Error ? error.message : String(error)}`)
  }

  for (let i = 0; i < retentionLimit; i += 1) {
    try {
      const result = await runNextCognitiveRetention()
      if (!result) break
      summary.retention.push(result)
    } catch (error) {
      summary.errors.push(`retention:${error instanceof Error ? error.message : String(error)}`)
      break
    }
  }
  return summary
}
