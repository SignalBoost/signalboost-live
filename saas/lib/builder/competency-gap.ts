import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

const NON_COMPETENCY_FAILURES = new Set([
  'builder_proposal_source_changed',
  'builder_repository_repair_owner_required',
  'builder_repository_repair_target_unavailable',
  'builder_runpod_primary_busy',
])

function bounded(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function subjectFor(objective: string): string {
  const text = bounded(objective, 500).toLowerCase()
  if (/typescript|next\.?js|code|software|debug|test|build|repository|deploy/.test(text)) return 'software engineering'
  if (/agent|mcp|tool|harness|orchestrat/.test(text)) return 'agent systems'
  if (/model|inference|distill|train|evaluat|embedding|dataset/.test(text)) return 'ml and ai engineering'
  return 'general reasoning'
}

export function builderCompetencyGapCandidate(input: {
  jobId: string
  objective: string
  error: string
  ownerAuthorized: boolean
}): { taskId: string; subject: string; capability: string; question: string; escalationReason: string } | null {
  const error = bounded(input.error, 240)
  if (!input.ownerAuthorized || !error || NON_COMPETENCY_FAILURES.has(error)) return null
  if (/unauthor|forbidden|approval|required|budget|capacity|busy|rate.?limit|timeout/i.test(error)) return null
  const subject = subjectFor(input.objective)
  const objective = bounded(input.objective, 360)
  if (!objective) return null
  return {
    taskId: `builder:${input.jobId}`,
    subject,
    capability: 'builder_autonomous_completion',
    question: `What reusable knowledge, procedure, or model capability would let Builder complete this class of objective without repeating the verified failure: ${objective}?`,
    escalationReason: `verified_builder_failure:${error}`,
  }
}

/**
 * Convert a verified terminal Builder capability failure into durable University input.
 * This grants no authority, starts no training by itself, and stores no raw trace/stdout/secrets.
 * The existing governed learning cycle decides acquisition, study, evaluation, and graduation.
 */
export async function recordBuilderCompetencyGap(input: {
  jobId: string
  objective: string
  error: string
  ownerAuthorized: boolean
}): Promise<{ filed: boolean; reason?: string }> {
  const gap = builderCompetencyGapCandidate(input)
  if (!gap) return { filed: false, reason: 'not_competency_failure' }
  const db = cosServiceDb()
  if (!db) return { filed: false, reason: 'learning_store_unavailable' }

  const existing = await db.from('cos_learning_gaps')
    .select('id,repeated_count')
    .eq('subject', gap.subject)
    .eq('capability', gap.capability)
    .eq('question', gap.question)
    .in('status', ['pending', 'failed'])
    .limit(1)
    .maybeSingle()
  if (existing.error) throw existing.error

  if (existing.data?.id) {
    const repeated = Math.max(1, Number(existing.data.repeated_count || 1)) + 1
    const update = await db.from('cos_learning_gaps').update({
      repeated_count: repeated,
      last_seen_at: new Date().toISOString(),
      status: 'pending',
      escalation_reason: gap.escalationReason,
    }).eq('id', existing.data.id)
    if (update.error) throw update.error
    return { filed: true }
  }

  const insert = await db.from('cos_learning_gaps').insert({
    task_id: gap.taskId,
    subject: gap.subject,
    question: gap.question,
    capability: gap.capability,
    confidence: 0,
    repeated_count: 1,
    status: 'pending',
    escalation_reason: gap.escalationReason,
  })
  if (insert.error) throw insert.error
  return { filed: true }
}
