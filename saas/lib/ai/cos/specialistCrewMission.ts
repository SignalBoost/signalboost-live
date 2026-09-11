import {
  runCOSMissionGraph,
  type COSMissionGraphResult,
} from '../../cos-core/orchestration/index.ts'
import {
  consultSpecialistCrew,
  type SpecialistCrewMissionInput,
  type SpecialistCrewMissionResult,
} from './specialistCrewClient.ts'

export type COSSpecialistCrewPlan = Readonly<{
  objective: string
  roles: SpecialistCrewMissionInput['roles']
  evidence?: string
  constraints?: string
  missionId?: string
}>

export type COSSpecialistCrewMissionResult = COSMissionGraphResult<
  COSSpecialistCrewPlan,
  SpecialistCrewMissionResult
>

export type COSSpecialistCrewMissionDependencies = {
  consult?: (input: SpecialistCrewMissionInput) => Promise<SpecialistCrewMissionResult>
}

function sameRoles(planned: readonly string[], returned: readonly string[] | undefined): boolean {
  if (!returned || planned.length !== returned.length) return false
  return planned.every((role, index) => returned[index] === role)
}

function authorityPreserved(result: SpecialistCrewMissionResult): boolean {
  return (
    result.authority?.side_effects_allowed === false &&
    result.authority?.approval_override_allowed === false &&
    result.authority?.referee_override_allowed === false &&
    result.authority?.persistent_memory_allowed === false &&
    result.memory?.durable_memory_used === false
  )
}

/**
 * Bounded COS -> LangGraph -> CrewAI -> specialists mission.
 *
 * The graph is deliberately single-attempt: specialist consultation may be
 * expensive, and a second CrewAI run must be an explicit new COS decision rather
 * than an automatic retry. LangGraph still supplies the auditable
 * plan/execute/verify state machine and refuses an advisory result that violates
 * the host-owned authority or ephemeral-memory boundary.
 */
export async function runCOSSpecialistCrewMission(
  input: SpecialistCrewMissionInput,
  dependencies: COSSpecialistCrewMissionDependencies = {},
): Promise<COSSpecialistCrewMissionResult> {
  const consult = dependencies.consult ?? consultSpecialistCrew

  return runCOSMissionGraph(
    input,
    {
      plan: ({ objective, roles, evidence, constraints, missionId }) => Object.freeze({
        objective: String(objective || '').trim(),
        roles: [...roles],
        evidence,
        constraints,
        missionId,
      }),
      execute: ({ plan }) => consult({
        objective: plan.objective,
        roles: [...plan.roles],
        evidence: plan.evidence,
        constraints: plan.constraints,
        missionId: plan.missionId,
      }),
      verify: ({ plan, result }) => {
        if (!result.ok) {
          return {
            ok: false,
            reason: `CrewAI advisory did not complete: ${result.status}${result.error ? ` — ${result.error}` : ''}`,
          }
        }
        if (result.framework !== 'crewai') {
          return { ok: false, reason: 'Specialist runtime did not identify itself as CrewAI.' }
        }
        if (!sameRoles(plan.roles, result.roles)) {
          return { ok: false, reason: 'CrewAI returned a different specialist roster than COS planned.' }
        }
        if (!authorityPreserved(result)) {
          return { ok: false, reason: 'CrewAI advisory violated the COS authority or memory boundary.' }
        }
        if (!String(result.report || '').trim()) {
          return { ok: false, reason: 'CrewAI returned no advisory report.' }
        }
        return { ok: true }
      },
    },
    { maxAttempts: 1, recursionLimit: 8 },
  )
}
