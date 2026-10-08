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

export type LabExperimentStartDb = {
  readExperiment: LabExecutionDb['readExperiment']
  startExperimentUniversityRun(input: {
    organizationId: string
    experimentId: string
    subjectId: string
    harnessRunId: string
    startedBy: string
  }): Promise<Record<string, unknown> | null>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
// The customer Harness names its runs `lab-customer-<uuid>` (platform-harness/adapters/lab-customer.ts). Requiring a
// bare UUID here rejected every real binding with lab_execution_invalid_identifier.
const HARNESS_RUN = /^(?:lab-customer-)?[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function uuid(value: unknown): string {
  const out = String(value ?? '').trim()
  if (!UUID.test(out)) throw new Error('lab_execution_invalid_identifier')
  return out
}

function harnessRun(value: unknown): string {
  const out = String(value ?? '').trim()
  if (!HARNESS_RUN.test(out)) throw new Error('lab_execution_invalid_identifier')
  return out
}

function assertHarnessAuthority(authority: VerifiedLabAuthority) {
  if (authority?.verifiedByHarness !== true
    || authority.capability !== 'university.distillation.execute'
    || authority.authorityExpanded !== false) {
    throw new Error('lab_execution_harness_authority_denied')
  }
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
  assertHarnessAuthority(authority)

  const organizationId = uuid(authority.organizationId)
  const experimentId = uuid(input.experimentId)
  const runId = uuid(input.runId)
  const harnessRunId = harnessRun(authority.harnessRunId)

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

/**
 * Start one experiment run on the existing factory: one prepared batch of the chosen subject, admitted under the same
 * rules as the rolling authorizer, one $1.825-ceiling campaign, bound to the experiment, plus an expiring execution
 * grant so the paused factory carries this run (and only this run) to a verdict. All of it is one database
 * transaction (lab.start_experiment_university_run). The caller must supply authority verified by the Harness.
 */
export async function startLabExperimentUniversityRun(input: {
  authority: VerifiedLabAuthority
  experimentId: string
  subjectId: string
  startedBy: string
  db: LabExperimentStartDb
}) {
  const authority = input.authority
  assertHarnessAuthority(authority)
  const organizationId = uuid(authority.organizationId)
  const experimentId = uuid(input.experimentId)
  const startedBy = uuid(input.startedBy)
  const harnessRunId = harnessRun(authority.harnessRunId)
  if (!harnessRunId.startsWith('lab-customer-')) throw new Error('lab_execution_invalid_identifier')
  const subjectId = String(input.subjectId ?? '').trim()
  if (!subjectId || subjectId.length > 200) throw new Error('lab_execution_subject_invalid')

  const experiment = await input.db.readExperiment({ organizationId, experimentId })
  if (!experiment || experiment.organizationId !== organizationId) {
    throw new Error('lab_execution_experiment_tenant_mismatch')
  }

  const started = await input.db.startExperimentUniversityRun({ organizationId, experimentId, subjectId, harnessRunId, startedBy })
  if (!started) throw new Error('lab_execution_start_failed')
  if (started.ok !== true) {
    return { ok: false as const, reason: String(started.reason || 'lab_execution_start_refused'), subjectId, authorityExpanded: false as const }
  }
  if (started.authorityExpanded !== false || started.organizationId !== organizationId || started.experimentId !== experimentId) {
    throw new Error('lab_execution_start_contract_violation')
  }
  return {
    ok: true as const,
    organizationId,
    experimentId,
    subjectId,
    grantId: String(started.grantId),
    universityRunId: String(started.universityRunId),
    campaignId: String(started.campaignId),
    candidateId: String(started.candidateId),
    batchKey: String(started.batchKey),
    expiresAt: String(started.expiresAt),
    maxTrainingCostUsd: Number(started.maxTrainingCostUsd),
    privacyTier: experiment.privacyTier,
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

export function createSupabaseLabExecutionDb(client: RpcClient): LabExecutionDb & LabExperimentStartDb {
  return {
    async startExperimentUniversityRun({ organizationId, experimentId, subjectId, harnessRunId, startedBy }) {
      const { data, error } = await client.rpc('itmounts_lab_start_experiment_university_run', {
        p_organization_id: organizationId,
        p_experiment_id: experimentId,
        p_subject_id: subjectId,
        p_harness_run_id: harnessRunId,
        p_started_by: startedBy,
      })
      rpcError(error, 'lab_execution_start_failed')
      return data && typeof data === 'object' ? data as Record<string, unknown> : null
    },
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
