import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

const COMPETENCY_FAILURES = new Set([
  'builder_verification_failed',
  'builder_model_control_failed',
  'builder_tool_selection_failed',
  'builder_repair_attempts_exhausted',
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

const QUESTION_BY_SUBJECT: Readonly<Record<string, string>> = Object.freeze({
  'software engineering': 'How should an autonomous software engineer diagnose, repair, and independently verify a failed implementation without weakening tests or acceptance criteria?',
  'agent systems': 'How should an autonomous agent diagnose and recover from a capability-level planning or tool-use failure while preserving authority and verification boundaries?',
  'ml and ai engineering': 'How should an autonomous ML engineer diagnose and repair a capability-level model, inference, training, or evaluation failure while preserving independent evaluation?',
  'general reasoning': 'What reusable reasoning procedure should an autonomous specialist use to diagnose a verified capability failure, attempt a bounded repair, and prove the corrected result?',
})

export function builderCompetencyGapCandidate(input: {
  jobId: string
  objective: string
  error: string
  ownerAuthorized: boolean
}): { taskId: string; subject: string; capability: string; question: string; escalationReason: string } | null {
  const error = bounded(input.error, 240)
  if (!input.ownerAuthorized || !COMPETENCY_FAILURES.has(error)) return null
  const subject = subjectFor(input.objective)
  return {
    taskId: `builder:${input.jobId}`,
    subject,
    capability: `builder_autonomous_completion:${error}`,
    question: QUESTION_BY_SUBJECT[subject] || QUESTION_BY_SUBJECT['general reasoning'],
    escalationReason: `verified_builder_failure:${error}`,
  }
}

/**
 * Convert only an explicitly classified Builder capability failure into durable University input.
 * The learning question is class-level and contains no raw objective/log text. This grants no
 * authority and does not bypass the University's acquisition, independent evaluation or graduation.
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
