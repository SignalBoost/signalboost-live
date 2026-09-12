/** Host-owned projection of public response-constraint failures. Never return arbitrary scorer text. */
export type UniversityPublicExamFeedback = 'response_length'
export type UniversityExamFeedbackIdentity = Readonly<{ agentId: string; runId: string }>

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const LENGTH_GUIDANCE = 'Additional non-credit practice focus: obey each task\'s stated word limit. Before answering, identify the word budget, allocate it to the essential claims and supporting evidence, draft below the ceiling, then count and revise the final answer without dropping material facts, qualifications or uncertainty. A concise answer still needs substantive correctness and a fresh independent retest.'

export function validUniversityExamFeedbackIdentity(identity: UniversityExamFeedbackIdentity): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,179}$/.test(identity.agentId) && UUID.test(identity.runId)
}

/** Only this exact host-recorded failure can emit a fixed, coarse training category. */
export function publicUniversityExamFeedback(
  value: unknown,
  expected: UniversityExamFeedbackIdentity,
  now = new Date(),
): UniversityPublicExamFeedback | null {
  if (!validUniversityExamFeedbackIdentity(expected) || !value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (row.id !== expected.runId || row.agent_id !== expected.agentId
    || row.status !== 'failed' || row.passed !== false
    || row.fresh_execution !== true || row.provenance_recorded !== true
    || row.local_model_invoked !== true || row.external_ai_invoked !== false) return null
  const completed = typeof row.completed_at === 'string' ? Date.parse(row.completed_at) : Number.NaN
  if (!Number.isFinite(completed) || completed > now.getTime()) return null
  if (expected.agentId !== 'cos' && row.response_source !== 'university_software_specialist_v1') return null
  if (expected.agentId === 'cos' && row.response_source !== 'local_cos_reasoning') return null
  if (!Array.isArray(row.reasons) || row.reasons.length > 64 || !row.reasons.every(reason => typeof reason === 'string')) return null
  return row.reasons.includes('word_limit_exceeded') ? 'response_length' : null
}

/** Additive guidance only: retain the subject objective, substantive standards and independent retest. */
export function withUniversityPublicExamFeedback(objective: string, feedback: unknown): string {
  if (feedback !== 'response_length' || objective.includes(LENGTH_GUIDANCE)) return objective
  return `${objective} ${LENGTH_GUIDANCE}`
}
