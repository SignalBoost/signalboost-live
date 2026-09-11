/**
 * Host capability check for credit-bearing University executions (independent exams, subject and
 * language A-range, delayed retention). Every one of those runners answers through tryCOSFirstAnswer,
 * which is COS's reasoner and carries no agent identity. Recording that answer under another agent
 * would credit COS's work to that agent, so any agent without its own bound executor fails closed:
 * nothing is created, executed, or graded for it. This is not academic evidence and grants no authority.
 */
export const COS_UNIVERSITY_ACADEMIC_EXECUTOR_UNAVAILABLE = 'agent_academic_executor_unavailable'

const AGENTS_WITH_BOUND_ACADEMIC_EXECUTOR: ReadonlySet<string> = new Set(['cos'])

export function cosUniversityAcademicExecutionBlocker(agentId: string): string | null {
  const id = String(agentId || '').trim()
  if (!id) return 'agent_id_required'
  return AGENTS_WITH_BOUND_ACADEMIC_EXECUTOR.has(id) ? null : COS_UNIVERSITY_ACADEMIC_EXECUTOR_UNAVAILABLE
}
