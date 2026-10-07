// saas/lib/ai/cos/itmountsLabUniversityExecution.ts
// Customer Lab -> existing University factory boundary.
// This module deliberately exposes no HTTP route. Tenant identity must first be proven by the
// Platform Harness; request JSON, query parameters and client JWT metadata are not authority.

export type LabPrivacyTier = 'PRIVATE' | 'AGGREGATE_METRICS' | 'RESEARCH_OPT_IN'

export type VerifiedLabAuthority = Readonly<{
  verifiedByHarness: true
  organizationId: string
  harnessRunId: string
  capability: 'university.distillation.execute'
  authorityExpanded: false
}>

export type LabExecutionDb = {
  readExperiment(input: { organizationId: string; experimentId: string }): Promise<null | {
    id: string
    organizationId: string
    privacyTier: LabPrivacyTier
    budgetMicrocredits: number
  }>
  readUniversityRun(runId: string): Promise<null | { id: string; authorityExpanded: boolean }>
  bindUniversityRun(input: {
    organizationId: string
    experimentId: string
    runId: string
    privacyTier: LabPrivacyTier
    harnessRunId: string
  }): Promise<void>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function uuid(value: unknown): string {
  const out = String(value ?? '').trim()
  if (!UUID.test(out)) throw new Error('lab_execution_invalid_identifier')
  return out
}

/**
 * Bind a real University run to a customer Experiment without creating a parallel factory.
 * The caller must supply authority already verified by the Platform Harness.
 */
export async function bindLabExperimentToUniversityRun(input: {
  authority: VerifiedLabAuthority
  experimentId: string
  runId: string
  db: LabExecutionDb
}) {
  const authority = input.authority
  if (authority?.verifiedByHarness !== true
    || authority.capability !== 'university.distillation.execute'
    || authority.authorityExpanded !== false) {
    throw new Error('lab_execution_harness_authority_denied')
  }

  const organizationId = uuid(authority.organizationId)
  const experimentId = uuid(input.experimentId)
  const runId = uuid(input.runId)
  const harnessRunId = uuid(authority.harnessRunId)

  const experiment = await input.db.readExperiment({ organizationId, experimentId })
  if (!experiment || experiment.organizationId !== organizationId) {
    throw new Error('lab_execution_experiment_tenant_mismatch')
  }
  if (!['PRIVATE', 'AGGREGATE_METRICS', 'RESEARCH_OPT_IN'].includes(experiment.privacyTier)) {
    throw new Error('lab_execution_privacy_tier_invalid')
  }
  if (!Number.isSafeInteger(experiment.budgetMicrocredits) || experiment.budgetMicrocredits < 0) {
    throw new Error('lab_execution_budget_invalid')
  }

  const run = await input.db.readUniversityRun(runId)
  if (!run) throw new Error('lab_execution_university_run_missing')
  if (run.authorityExpanded) throw new Error('lab_execution_authority_expansion_denied')

  await input.db.bindUniversityRun({
    organizationId,
    experimentId,
    runId,
    privacyTier: experiment.privacyTier,
    harnessRunId,
  })

  return {
    ok: true as const,
    organizationId,
    experimentId,
    runId,
    privacyTier: experiment.privacyTier,
    budgetMicrocredits: experiment.budgetMicrocredits,
    harnessRunId,
    authorityExpanded: false as const,
    factory: 'existing_cos_university' as const,
  }
}


type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: null | { message?: string } }>
}

function rpcError(error: null | { message?: string }, fallback: string) {
  if (error) throw new Error(error.message || fallback)
}

export function createSupabaseLabExecutionDb(client: RpcClient): LabExecutionDb {
  return {
    async readExperiment({ organizationId, experimentId }) {
      const { data, error } = await client.rpc('itmounts_lab_experiment_execution_contract', {
        p_organization_id: organizationId,
        p_experiment_id: experimentId,
      })
      rpcError(error, 'lab_execution_experiment_read_failed')
      if (!data) return null
      const row = data as Record<string, unknown>
      return {
        id: String(row.id ?? ''),
        organizationId: String(row.organization_id ?? ''),
        privacyTier: String(row.privacy_tier ?? '') as LabPrivacyTier,
        budgetMicrocredits: Number(row.budget_microcredits),
      }
    },
    async readUniversityRun(runId) {
      const { data, error } = await client.rpc('itmounts_lab_university_run_execution_contract', { p_run_id: runId })
      rpcError(error, 'lab_execution_university_run_read_failed')
      if (!data) return null
      const row = data as Record<string, unknown>
      return { id: String(row.id ?? ''), authorityExpanded: row.authority_expanded === true }
    },
    async bindUniversityRun({ organizationId, experimentId, runId }) {
      const { error } = await client.rpc('itmounts_lab_bind_university_run', {
        p_run_id: runId,
        p_organization_id: organizationId,
        p_experiment_id: experimentId,
      })
      rpcError(error, 'lab_execution_university_run_bind_failed')
    },
  }
}
