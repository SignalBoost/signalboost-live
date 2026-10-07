// Factory pause is global for scheduled ticks. A customer experiment must never
// turn that switch off or smuggle its authority into a cron invocation.
// Only a trusted, run-scoped dispatcher may use the explicit-experiment decision.
export type ExperimentExecutionAuthority = Readonly<{
  verifiedByHarness: true
  organizationId: string
  experimentId: string
  universityRunId: string
  expiresAt: string
  capability: 'university.distillation.execute'
  authorityExpanded: false
}>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const validId = (v: unknown) => typeof v === 'string' && UUID.test(v)

export function decideUniversityStationExecution(input: Readonly<{
  paused: boolean
  pauseKnown: boolean
  invocation: 'scheduled' | 'explicit_experiment'
  authority?: ExperimentExecutionAuthority | null
  organizationId?: string
  experimentId?: string
  universityRunId?: string
  now: Date
}>): Readonly<{ allowed: boolean; reason: string }> {
  if (!input.pauseKnown) return { allowed: false, reason: 'pause_state_unavailable' }
  if (input.invocation === 'scheduled') {
    return input.paused
      ? { allowed: false, reason: 'automatic_line_paused' }
      : { allowed: true, reason: 'automatic_line_running' }
  }
  const a = input.authority
  if (!a || a.verifiedByHarness !== true || a.authorityExpanded !== false
    || a.capability !== 'university.distillation.execute'
    || !validId(a.organizationId) || !validId(a.experimentId) || !validId(a.universityRunId)
    || a.organizationId !== input.organizationId || a.experimentId !== input.experimentId
    || a.universityRunId !== input.universityRunId) {
    return { allowed: false, reason: 'experiment_authority_denied' }
  }
  const expiry = Date.parse(a.expiresAt)
  if (!Number.isFinite(expiry) || expiry <= input.now.getTime()) {
    return { allowed: false, reason: 'experiment_authority_expired' }
  }
  return { allowed: true, reason: 'verified_explicit_experiment' }
}
