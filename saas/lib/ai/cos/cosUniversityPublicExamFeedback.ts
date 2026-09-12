/** Host-owned projection of public response-constraint failures. Never return arbitrary scorer text. */
export type UniversityPublicExamFeedback = 'response_length' | 'response_contract_unverified'
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
  assessment: unknown = null,
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
  if (!row.reasons.includes('word_limit_exceeded')) return null
  // The host assessment must belong to this exact learner, examination and execution trace.
  // Missing/unavailable rows are unknown, not proof of either disclosure or nondisclosure.
  if (!assessment || typeof assessment !== 'object' || Array.isArray(assessment)) return null
  const recorded = assessment as Record<string, unknown>
  if (recorded.agent_id !== expected.agentId
    || recorded.assessment_key !== `cos-university-exam:${expected.runId}`
    || recorded.source_ref !== `cos_university_exam:${expected.runId}`
    || recorded.assessment_kind !== 'unseen_subject_exam' || recorded.passed !== false
    || recorded.independent_scorer !== true || recorded.scorer_authority !== 'host_private_exam'
    || typeof row.turn_id !== 'string' || !UUID.test(row.turn_id)
    || recorded.turn_id !== row.turn_id || recorded.response_source !== row.response_source) return null
  const observed = typeof recorded.observed_at === 'string' ? Date.parse(recorded.observed_at) : Number.NaN
  if (!Number.isFinite(observed) || observed > now.getTime()) return null
  // A matching historical assessment with no contract can withdraw our unsupported suffix,
  // but cannot diagnose a learner weakness or change the recorded examination outcome.
  const valueContract = recorded.response_contract
  if (valueContract === undefined || valueContract === null) return 'response_contract_unverified'
  if (typeof valueContract !== 'object' || Array.isArray(valueContract)) return null
  const contract = valueContract as Record<string, unknown>
  if (contract.version !== 'university_response_contract_v1'
    || !Number.isSafeInteger(contract.maxWords) || Number(contract.maxWords) <= 0
    || contract.counting !== 'whitespace_separated_tokens'
    || contract.scope !== 'entire_final_response') return null
  return 'response_length'
}

/** Reconcile only this host suffix; the planner separately fences active state, identity and concurrency. */
export function withUniversityPublicExamFeedback(objective: string, feedback: unknown): string {
  if (feedback === 'response_contract_unverified') {
    const suffix = ` ${LENGTH_GUIDANCE}`
    return objective.endsWith(suffix) ? objective.slice(0, -suffix.length) : objective
  }
  if (feedback !== 'response_length' || objective.includes(LENGTH_GUIDANCE)) return objective
  return `${objective} ${LENGTH_GUIDANCE}`
}
