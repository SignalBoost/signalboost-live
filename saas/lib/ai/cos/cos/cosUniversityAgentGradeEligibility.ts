// saas/lib/ai/cos/cosUniversityAgentGradeEligibility.ts
import { isSoftwareCapstoneIdentity, SOFTWARE_CAPSTONE_RUNTIME } from './cosUniversityAgentCapstone.ts'

/**
 * Grade eligibility by executing identity.
 *
 * Until the agent-bound executors shipped, every graded University lane answered through COS's own
 * reasoner. Rows written for another agent in that period record COS's work under that agent's name,
 * so they must not count toward that agent's grades. They are never deleted: they remain as history
 * and simply stop being grade-eligible.
 *
 * COS is unaffected — its rows always were its own work.
 * Verified Production evidence is also unaffected: it comes from that agent's own real work, tagged
 * in the outcome source, and never from a model answering an exam.
 */
export const COS_GENERALIST_AGENT_ID = 'cos'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** True when this assessment row's evidence proves the named agent's own bound execution. */
export function assessmentCarriesBoundExecution(evidence: unknown, agentId: string): boolean {
  const execution = record(record(evidence).executionProvenance)
  return execution.runtime === SOFTWARE_CAPSTONE_RUNTIME
    && isSoftwareCapstoneIdentity(agentId, execution.role)
    && execution.agentId === agentId
    && execution.academicAuthority === 'none'
    && typeof execution.model === 'string'
    && execution.model.trim().length > 0
    && typeof execution.turnId === 'string'
    && execution.turnId.trim().length > 0
}

export function assessmentGradeEligibleForAgent(row: {
  agent_id?: string | null
  scorer_authority: string
  evidence?: unknown
}, agentId: string): boolean {
  const owner = String(row.agent_id ?? agentId).trim()
  if (!owner || owner !== agentId) return false
  if (owner === COS_GENERALIST_AGENT_ID) return true
  // The agent's own verified Production work is not a model-answered exam and needs no executor.
  if (row.scorer_authority === 'verified_production') return true
  return assessmentCarriesBoundExecution(row.evidence, owner)
}
