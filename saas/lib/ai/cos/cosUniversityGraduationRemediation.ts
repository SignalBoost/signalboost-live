/** Host database evidence only. Study progress cannot stand in for a resolved independent failure. */
export const COS_UNIVERSITY_GRADUATION_REMEDIATION_SEMANTICS = 'agent_scoped_pending_undergraduate_remediation_v1' as const
export const COS_UNIVERSITY_GRADUATION_REMEDIATION_SAMPLE_LIMIT = 25

export type CosUniversityGraduationRemediation = Readonly<{
  agentId: string
  programKey: string
  pendingCount: number
  blockers: readonly Readonly<{ planId: string; sourceKind: string; status: string }>[]
  checkedAt: string
  semantics: typeof COS_UNIVERSITY_GRADUATION_REMEDIATION_SEMANTICS
}>

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_graduation_remediation_receipt')
  }
  return value as Record<string, unknown>
}

/** A missing, malformed or differently scoped RPC response must never become zero pending plans. */
export function parseCosUniversityGraduationRemediation(
  value: unknown,
  expected: { agentId: string; programKey: string },
): CosUniversityGraduationRemediation {
  if (!expected.agentId.trim() || expected.agentId.trim() !== expected.agentId
    || expected.programKey !== 'generalist_undergraduate_v1') {
    throw new Error('invalid_graduation_remediation_scope')
  }
  const row = object(value)
  if (row.agentId !== expected.agentId || row.programKey !== expected.programKey) {
    throw new Error('graduation_remediation_scope_mismatch')
  }
  const count = row.pendingCount
  if (row.semantics !== COS_UNIVERSITY_GRADUATION_REMEDIATION_SEMANTICS
    || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0
    || !Array.isArray(row.blockers)
    || row.blockers.length !== Math.min(count, COS_UNIVERSITY_GRADUATION_REMEDIATION_SAMPLE_LIMIT)
    || typeof row.checkedAt !== 'string' || !Number.isFinite(Date.parse(row.checkedAt))) {
    throw new Error('invalid_graduation_remediation_receipt')
  }
  const seen = new Set<string>()
  const blockers = row.blockers.map((value) => {
    const plan = object(value)
    if (typeof plan.planId !== 'string' || !plan.planId.trim() || seen.has(plan.planId)
      || typeof plan.sourceKind !== 'string' || !['failure_autopsy', 'operational_weakness', 'recertification'].includes(plan.sourceKind)
      || typeof plan.status !== 'string' || !['queued', 'studying', 'ready_for_exam'].includes(plan.status)) {
      throw new Error('invalid_graduation_remediation_receipt')
    }
    seen.add(plan.planId)
    return Object.freeze({ planId: plan.planId, sourceKind: plan.sourceKind, status: plan.status })
  })
  return Object.freeze({
    agentId: expected.agentId, programKey: expected.programKey, pendingCount: count,
    blockers: Object.freeze(blockers), checkedAt: row.checkedAt,
    semantics: COS_UNIVERSITY_GRADUATION_REMEDIATION_SEMANTICS,
  })
}

/** This may only restrict a new award. It never awards, revokes, edits grades or repairs a plan. */
export function applyCosUniversityGraduationRemediation<T extends {
  graduated: boolean
  awardEligible: boolean
  prerequisitesReady: boolean
}>(status: T, remediation: CosUniversityGraduationRemediation): T & { remediation: CosUniversityGraduationRemediation } {
  const blocked = !status.graduated && remediation.pendingCount > 0
  return {
    ...status,
    awardEligible: status.awardEligible && !blocked,
    prerequisitesReady: status.prerequisitesReady && !blocked,
    remediation,
  }
}
