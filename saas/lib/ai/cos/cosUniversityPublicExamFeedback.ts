/** Host-owned projection of public response-constraint failures. Never return arbitrary scorer text. */
export type UniversityPublicExamFeedback = 'response_length' | 'undisclosed_response_length'
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
  if (!row.reasons.includes('word_limit_exceeded')) return null
  // The run flags prove execution, not disclosure. Only the same run's host-scored assessment
  // may establish which public response contract the executor actually presented.
  const raw = row.response_contract_evidence
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const proof = raw as Record<string, unknown>
  if (proof.agent_id !== expected.agentId || proof.assessment_key !== `cos-university-exam:${expected.runId}`
    || proof.source_ref !== `cos_university_exam:${expected.runId}`
    || proof.assessment_kind !== 'unseen_subject_exam' || proof.passed !== false
    || proof.independent_scorer !== true || proof.scorer_authority !== 'host_private_exam') return null
  const observed = typeof proof.observed_at === 'string' ? Date.parse(proof.observed_at) : Number.NaN
  if (!Number.isFinite(observed) || observed > now.getTime()) return null
  // A confirmed old assessment with no contract is different from unavailable/malformed evidence.
  // It supports restoring generic remediation, never an accusation of ignoring a stated limit.
  if (proof.response_contract === undefined || proof.response_contract === null) return 'undisclosed_response_length'
  if (typeof proof.response_contract !== 'object' || Array.isArray(proof.response_contract)) return null
  const contract = proof.response_contract as Record<string, unknown>
  if (contract.version !== 'university_response_contract_v1'
    || contract.counting !== 'whitespace_separated_tokens' || contract.scope !== 'entire_final_response'
    || typeof contract.maxWords !== 'number' || !Number.isSafeInteger(contract.maxWords) || contract.maxWords <= 0) return null
  return 'response_length'
}

/** Retain the subject objective; reconcile only the exact host-generated coaching suffix. */
export function withUniversityPublicExamFeedback(objective: string, feedback: unknown): string {
  if (feedback === 'undisclosed_response_length') {
    const suffix = ` ${LENGTH_GUIDANCE}`
    return objective.endsWith(suffix) ? objective.slice(0, -suffix.length) : objective
  }
  if (feedback !== 'response_length' || objective.includes(LENGTH_GUIDANCE)) return objective
  return `${objective} ${LENGTH_GUIDANCE}`
}
