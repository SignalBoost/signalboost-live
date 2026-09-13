import {
  isBoundRegisteredSpecialistEvidence,
  isRegisteredSpecialistIdentity,
} from './cosUniversityRegisteredSpecialistExecutor.ts'

/** Host capability checks, not academic evidence or a grant of authority. */
export function cosUniversityGraduationRuntimeBlocker(agentId: string, registeredRole?: string | null): string | null {
  if (!agentId.trim()) return 'agent_id_required'
  if (agentId === 'cos' && (registeredRole === undefined || registeredRole === 'chief_of_staff_generalist')) return null
  return isRegisteredSpecialistIdentity(agentId, registeredRole) ? null : 'agent_capstone_runtime_unavailable'
}

export function requireCosUniversityGraduationRuntime(agentId: string, registeredRole?: string | null): void {
  const blocker = cosUniversityGraduationRuntimeBlocker(agentId, registeredRole)
  if (blocker) throw new Error(blocker)
}

function executionRuntime(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  return String((value as Record<string, unknown>).runtime ?? '').trim()
}

export function isCosUniversityGraduationExecutionEvidence(row: {
  id?: string
  manifest_hash?: string
  execution_provenance?: unknown
  agent_id: string
  fresh_execution: boolean
  local_model_invoked: boolean
  external_ai_invoked: boolean
  response_source: string | null
  turn_id: string | null
}, agentId: string, registeredRole?: string | null, now = new Date()): boolean {
  return cosUniversityGraduationRuntimeBlocker(agentId, registeredRole) === null
    && row.agent_id === agentId
    && row.fresh_execution === true
    && row.local_model_invoked === true
    && row.external_ai_invoked === false
    && Boolean(row.turn_id?.trim())
    && Boolean(row.response_source?.trim())
    && row.response_source !== 'semantic_cache'
    && row.response_source !== 'semantic_similarity'
    && (agentId === 'cos'
      ? row.execution_provenance == null
      : (row.response_source === executionRuntime(row.execution_provenance)
      && isBoundRegisteredSpecialistEvidence(row.execution_provenance, row, registeredRole, now)))
}

/** Absolute hours avoid resetting the rotation daily when there are more than 24 agents. */
export function rotateCosUniversityGraduationAgents<T>(agents: readonly T[], now: Date): T[] {
  const hour = Math.floor(now.getTime() / 3_600_000)
  if (!Number.isFinite(hour)) throw new Error('invalid_graduation_time')
  if (!agents.length) return []
  const offset = ((hour % agents.length) + agents.length) % agents.length
  return [...agents.slice(offset), ...agents.slice(0, offset)]
}

export function cosUniversityGraduationAdmissionBlocker(input: {
  agentId: string
  enabled: boolean
  errors: readonly string[]
  capstoneState: string
}): string | null {
  if (!input.enabled) return 'graduation_gate_disabled'
  if (input.errors.length || input.capstoneState === 'error') return 'graduation_evaluation_failed'
  // Master's workers are agent-scoped. A successful registered learner may proceed to the ordinary
  // admission decision; this function does not itself award or create a graduate enrollment.
  return null
}
